import { catchAsyncError } from "../MiddleWare/CatchAsyncError.js";
import WithdrawModel from "../Model/WithdrawModel.js";
import UserModel from "../Model/UserModel.js";
import mongoose from "mongoose";
import SendMail from "../Utils/SendMail.js";

export const withdrawRequest = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { amount } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized request." });
    }

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is 100 PKR.",
      });
    }

    // Fetch user details
    const user = await UserModel.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const referralCount = Array.isArray(user.referrals)
      ? user.referrals.length
      : 0;

    if (
      (amount === 100 && referralCount < 1) ||
      (amount === 150 && referralCount < 1) ||
      (amount === 500 && referralCount < 3) ||
      (amount === 1000 && referralCount < 5)
    ) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal conditions not met. Check referral requirements.",
      });
    }

    if (user.convertedPointsInPKR < amount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance." });
    }

    user.convertedPointsInPKR -= amount;
    await user.save();
    console.log("User balance after withdrawal:", user.convertedPointsInPKR);

    await WithdrawModel.create({ userId, amount });

    // Send email to the user
    const userEmail = user.email;
    const userSubject = "Withdrawal Request Submitted";
    const userText = `Dear ${user.name},
    We have received your withdrawal request of ${amount} PKR. Our team will process your request soon.
    If you have any queries, feel free to contact our support team.
    Best regards,
    BMX Adventure Team  
    `;

    await SendMail(userEmail, userSubject, userText);

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminSubject = "New Withdrawal Request Submitted";
    const adminText = `Hello Admin,
    A new withdrawal request has been submitted.
    User: ${user.name}  
    Email: ${user.email}  
    Amount: ${amount} PKR  
    Please review and process the request accordingly.
    Best regards,  
    [Your System Notification]`;

    await SendMail(adminEmail, adminSubject, adminText);

    return res.status(200).json({
      success: true,
      message:
        "Withdrawal request submitted successfully. You will receive an email confirmation shortly.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

export const getAllWithdrawRequests = catchAsyncError(
  async (req, res, next) => {
    const { page = 1, limit = 10, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const withdrawRequests = await WithdrawModel.find()
      .populate("userId", "name email balance")
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalRequests = await WithdrawModel.countDocuments(query);
    res.status(200).json({
      success: true,
      totalRequests,
      page: parseInt(page),
      limit: parseInt(limit),
      data: withdrawRequests,
    });
  }
);

export const updateWithdrawStatus = catchAsyncError(async (req, res, next) => {
  const { withdrawId } = req.params;
  const { status } = req.body;

  try {
    if (!status || !["Pending", "Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (!mongoose.Types.ObjectId.isValid(withdrawId)) {
      return res
        .status(400)
        .json({ message: "Invalid withdrawal request ID format." });
    }

    const updatedRequest = await WithdrawModel.findByIdAndUpdate(
      withdrawId,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: "Withdrawal request not found" });
    }

    const user = await UserModel.findById(updatedRequest.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userEmail = user.email;
    const userSubject = `Your Withdrawal Request Status Update`;
    let userText = `Dear ${user.name},\n\n`;

    if (status === "Approved") {
      userText += `Congratulations! Your withdrawal request of ${updatedRequest.amount} PKR has been approved. The amount will be processed shortly.\n\n`;
    } else if (status === "Rejected") {
      userText += `Unfortunately, your withdrawal request of ${updatedRequest.amount} PKR has been rejected. Please contact support for further details.\n\n`;
    } else {
      userText += `Your withdrawal request of ${updatedRequest.amount} PKR is currently pending. Our team will review and update you soon.\n\n`;
    }

    userText += `Best regards,\n BMX Adventure Team`;

    await SendMail(userEmail, userSubject, userText);

    res.status(200).json({
      success: true,
      message: `Withdrawal request ${status} successfully.`,
      updatedRequest,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});