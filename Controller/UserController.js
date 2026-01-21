import UserModel from "../Model/UserModel.js";
import Feedbackmodel from "../Model/Feedbackmodel.js";
import Errorhandler from "../Utils/ErrorHandler.js";
import { catchAsyncError } from "../MiddleWare/CatchAsyncError.js";
import SendMail from "../Utils/SendMail.js";
import mongoose from "mongoose";

export const Signup = catchAsyncError(async (req, res, next) => {
  const { name, email, password, referralCode } = req.body;

  let referredByUser = null;

  // Check if user already exists
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    return next(new Errorhandler("Email already registered", 400));
  }

  // Handle referral code validation
  if (referralCode) {
    const [username, , userId] = referralCode.split("/");
    if (!username || !userId) {
      return next(new Errorhandler("Invalid referral code format", 400));
    }

    referredByUser = await UserModel.findOne({ referralLink: referralCode });

    if (!referredByUser) {
      return next(new Errorhandler("Invalid referral code", 400));
    }
  }

  // Create new user (status: "pending")
  const user = await UserModel.create({
    name,
    email,
    password,
    referredBy: referredByUser ? referredByUser._id : null,
    status: "pending",
  });

  // Generate OTP
  const otp = await user.generateOTP();
  const subject = "Verify Your Email - BMX Adventure";
  const text = generateEmailTemplate(name, otp);

  // Send verification email
  await SendMail(email, subject, text);

  res.status(200).json({
    success: true,
    message: "OTP sent to email. Verify your account.",
    user,
  });
});

// Utility function for email template
const generateEmailTemplate = (name, otp) => `
  <p>Hello <strong>${name}</strong>,</p>
  <p>Thank you for signing up! To complete your registration, please verify your email.</p>
  <p>Your OTP for verification is:</p>
  <h3 style="font-size: 32px; font-weight: bold; color: #4CAF50;">${otp}</h3>
  <p>If you did not request this, please ignore this email.</p>
  <p>Best regards,</p>
  <p>The BMX Adventure Team</p>
`;

export const verifyUser = catchAsyncError(async (req, res, next) => {
  const { email, otp } = req.body;

  const user = await UserModel.findOne({ email });
  if (!user) return next(new Errorhandler("User not found", 404));

  if (user.status === "verified") {
    return next(new Errorhandler("User is already verified", 400));
  }

  if (!user.verifyOTP(otp)) {
    return next(new Errorhandler("Invalid or expired OTP", 400));
  }

  // Update user verification status
  user.otp = undefined;
  user.otpExpires = undefined;
  user.status = "verified";
  await user.save();

  // Assign referral points ONLY after verification
  if (user.referredBy) {
    const referredByUser = await UserModel.findById(user.referredBy);
    if (referredByUser) {
      referredByUser.referredPoints = referredByUser.referredPoints || [];
      referredByUser.referredPoints.push({ userId: user._id, points: 1000 });
      await referredByUser.save();
    }
  }

  // Generate JWT token
  const token = user.getJWTToken();

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000,
  });

  res.status(200).json({ message: "User verified successfully", user });
});

export const forgotPasswordOTP = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new Errorhandler("Email is required.", 400));
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return next(new Errorhandler("User not found with this email.", 404));
  }

  const otp = await user.generateOTP();
  console.log("otp is .....", otp);

  const name = user.name;
  const subject = "OTP for Password Reset";
  const text = `
    <p>Hello <strong>${name}</strong>,</p>
    <p>We received a request to reset your password for your account. To proceed, please use the OTP below:</p>
    <h3 style="font-size: 32px; font-weight: bold; color: #4CAF50;">${otp}</h3>
    <p>This OTP is valid for a limited time. If you did not request a password reset, please ignore this email or contact our support team immediately.</p>
    <p>Best regards,</p>
    <p>The Car Rental Service Team</p>
  `;

  await SendMail(email, subject, text);

  user.otp = otp;
  await user.save();

  res.status(200).json({ message: "OTP sent successfully!" });
});

export const verifyOTP = catchAsyncError(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new Errorhandler("Email and OTP are required.", 400));
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return next(new Errorhandler("User not found with this email.", 404));
  }

  if (user.otp !== otp) {
    return next(new Errorhandler("Invalid or Expired OTP.", 400));
  }

  res.status(200).json({ message: "OTP verified successfully." });
});

export const resetPassword = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new Errorhandler("Email and Password are required.", 400));
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return next(new Errorhandler("User not found with this email.", 404));
  }

  if (!user.otp) {
    return next(
      new Errorhandler("OTP not verified. Please verify your OTP first.", 400)
    );
  }

  user.password = password;
  user.otp = undefined;
  await user.save();

  res.status(200).json({ message: "Password reset successfully." });
});

export const getReferredUserData = catchAsyncError(async (req, res, next) => {
  try {
    const { referralCode } = req.query;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: "Referral code is required",
      });
    }

    const referredByUser = await UserModel.findOne({
      referralLink: referralCode,
    }).populate({
      path: "referredPoints.userId",
      select: "name email UserLevel totalPointsEarned referralLink",
    });

    if (!referredByUser) {
      return res.status(404).json({
        success: false,
        message: "Referred user not found",
      });
    }

    const referredUsersData = [];

    for (let point of referredByUser.referredPoints) {
      if (point.userId) {
        const latestUser = await UserModel.findById(point.userId).select(
          "name email UserLevel totalPointsEarned referralLink"
        );

        if (latestUser) {
          referredUsersData.push({
            name: latestUser.name,
            email: latestUser.email,
            UserLevel: latestUser.UserLevel,
            totalPointsEarned: latestUser.totalPointsEarned,
            referralLink: latestUser.referralLink,
          });
        }
      }
    }

    if (referredUsersData.length > 0) {
      return res.status(200).json({
        success: true,
        referredUsers: referredUsersData,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "No referred users found",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export const Login = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await UserModel.findOne({ email }).select("+password");
  if (!user) {
    return next(new Errorhandler("User Not Found", 404));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new Errorhandler("Invalid Email or Password", 401));
  }

  // Check if the user is still pending verification
  if (user.status === "pending") {
    await UserModel.findByIdAndDelete(user._id); // Delete the user
    return next(
      new Errorhandler(
        "Your account was not verified and has been deleted. Please sign up again.",
        403
      )
    );
  }

  // Generate token for verified users
  const token = user.getJWTToken();
  res
    .status(200)
    .cookie("token", token, {
      expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      sameSite: "None",
      secure: true,
    })
    .json({
      success: true,
      message: "User Logged In Successfully",
      user,
      token,
    });
});

export const Logout = catchAsyncError(async (req, res, next) => {
  res.cookie("token", null, {
    httpOnly: true,
    expires: new Date(Date.now()),
  });

  res.status(200).json({
    success: true,
    message: "User Logged Out Successfully",
  });
});

export const getallusers = catchAsyncError(async (req, res, next) => {
  const users = await UserModel.find();
  res.json({
    success: true,
    count: users.length,
    users,
  });
});

export const Myprofile = catchAsyncError(async (req, res, next) => {
  const user = await req.user;

  if (!user) {
    return next(new Errorhandler("User not logged in", 400));
  }

  res.status(200).json({
    success: true,
    user,
  });
});

export const updatePass = catchAsyncError(async (req, res, next) => {
  const { oldPassword, Password, ConfirmPassword } = req.body;

  if (!oldPassword || !Password || !ConfirmPassword) {
    return next(
      new Errorhandler("Please provide all the required fields", 400)
    );
  }

  let user = await UserModel.findById(req.user._id).select("+password");

  if (!user) {
    return next(new Errorhandler("User not found", 404));
  }

  const isPasswordmatch = await user.comparePassword(oldPassword);

  if (!isPasswordmatch) {
    return next(new Errorhandler("Old password is incorrect", 401));
  }

  if (Password !== ConfirmPassword) {
    return next(new Errorhandler("Passwords do not match", 400));
  }

  user.password = Password;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password updated successfully",
  });
});

export const DailyClaim = catchAsyncError(async (req, res, next) => {
  const userId = req.user?._id;

  if (!userId) {
    return next(new Errorhandler("User not logged in", 400));
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    return next(new Errorhandler("User not found", 404));
  }

  if (user.eligible === "false") {
    return null;
  }

  const currentDate = new Date().toISOString().split("T")[0];
  const lastClaimDate = user.dailyPoints?.lastClaimDate
    ? user.dailyPoints.lastClaimDate.toISOString().split("T")[0]
    : null;

  if (lastClaimDate !== currentDate) {
    user.dailyPoints.count = 0;
    user.dailyPoints.lastClaimDate = new Date();
  }

  if (user.dailyPoints.count >= 5) {
    return res.status(400).json({
      success: false,
      message: "Daily claim limit reached. Try again tomorrow.",
    });
  }

  const pointsToAdd = 20;
  user.dailyPoints.count += 1;
  user.dailyPoints.totalPoints += pointsToAdd;
  user.totalPointsEarned += pointsToAdd;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Daily points added successfully",
    dailyClaimCount: user.dailyPoints.count,
    user,
  });
});

export const investment = catchAsyncError(async (req, res, next) => {
  const userId = req.user?._id;
  const { amount } = req.body;

  if (!userId) {
    return next(new Errorhandler("User not logged in", 400));
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    return next(new Errorhandler("User not found", 404));
  }

  if (!amount || amount < 1000) {
    return next(
      new Errorhandler("Amount is compulsory and must be at least 1000", 400)
    );
  }

  user.eligible = true;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Investment successful. User is now eligible.",
    user,
  });
});

export const addFeedback = catchAsyncError(async (req, res, next) => {
  const { content } = req.body;

  if (!content) {
    return next(new Errorhandler("Feedback content is required", 400));
  }

  const user = await UserModel.findById(req.user._id);
  if (!user) {
    return next(new Errorhandler("User not found", 404));
  }

  const existingFeedback = await Feedbackmodel.findOne({
    userId: req.user._id,
  });

  if (existingFeedback) {
    await Feedbackmodel.findByIdAndDelete(existingFeedback._id);
  }

  const feedback = await Feedbackmodel.create({
    userId: req.user._id,
    content,
  });

  const populatedFeedback = await Feedbackmodel.findById(feedback._id).populate(
    {
      path: "userId",
      select: "name email",
    }
  );

  res.status(201).json({
    success: true,
    message: "Feedback submitted successfully",
    feedback: populatedFeedback,
  });
});

export const convertPoints = catchAsyncError(async (req, res, next) => {
  try {
    const POINTS_TO_PKR_RATE = 4;
    const userId = req.params.id;
    const user = await UserModel.findById(userId);

    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    const totalPoints = user.dailyPoints?.totalPoints;

    if (typeof totalPoints !== "number" || isNaN(totalPoints)) {
      return next(
        new Errorhandler("Invalid totalPoints value for the user", 400)
      );
    }

    const convertedPKR = Math.floor(totalPoints / POINTS_TO_PKR_RATE);

    user.convertedPointsInPKR += convertedPKR;
    user.dailyPoints.totalPoints = 0;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Your Bep coins have been successfully exchanged.",
      data: {
        totalPoints: user.dailyPoints.totalPoints,
        convertedPointsInPKR: user.convertedPointsInPKR,
      },
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export const convertReferredPoints = catchAsyncError(async (req, res, next) => {
  try {
    const POINTS_TO_PKR_RATE = 4;
    const userId = req.params.id;

    const user = await UserModel.findById(userId);

    if (!user) {
      return next(new Errorhandler("User not found", 404));
    }

    if (
      !Array.isArray(user.referredPoints) ||
      user.referredPoints.length === 0
    ) {
      return next(
        new Errorhandler("No referred points found for the user", 400)
      );
    }

    const totalReferredPoints = user.referredPoints.reduce(
      (acc, ref) => acc + (ref.points || 0),
      0
    );

    if (typeof totalReferredPoints !== "number" || isNaN(totalReferredPoints)) {
      return next(
        new Errorhandler("Invalid points value in referredPoints array", 400)
      );
    }

    const convertedPKR = Math.floor(totalReferredPoints / POINTS_TO_PKR_RATE);

    user.referredPoints = user.referredPoints.map((ref) => ({
      ...ref,
      points: 0,
    }));

    user.convertedPointsInPKR = (user.convertedPointsInPKR || 0) + convertedPKR;

    await user.save();

    res.status(200).json({
      success: true,
      message:
        "The coins from your referral link have been successfully exchanged.",
      data: {
        totalReferredPoints,
        convertedPointsInPKR: user.convertedPointsInPKR,
      },
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



export const updateEligibilityCriteria = catchAsyncError(
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const { userId } = req.params;

      // Validation
      if (status === undefined || status === null) {
        return next(new Errorhandler("Status is required", 403));
      }
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return next(new Errorhandler("Invalid user ID format", 400));
      }

      const user = await UserModel.findById(userId);
      if (!user) return next(new Errorhandler("User not found", 404));

      // Send email notification
      await SendMail(
        user.email,
        "Update on Your Eligibility Status",
        `<p>Dear <strong>${user.name}</strong></p>
        <p>Your eligibility status has been updated to: <strong>${status}</strong></p>
        <p>Contact support for any questions.</p>
        <p>Best regards,<br/>BMX Adventure Team</p>`
      );

      // Update user eligibility
      user.eligible = status;
      await user.save();

      // Process referral if applicable
      if (status === true && user.referredBy) {
        const referrer = await UserModel.findById(user.referredBy);

        if (referrer?.eligible === true) {
          const POINTS_BY_LEVEL = {
            1: 1000,
            2: 1400,
            3: 2000,
            4: 2500,
          };

          const pointsToAdd = POINTS_BY_LEVEL[referrer.UserLevel] || 1000;

          referrer.referredPoints.push({
            userId: user._id,
            points: pointsToAdd,
            userDetails: {
              name: user.name,
              email: user.email,
              UserLevel: user.UserLevel,
              totalPointsEarned: user.totalPointsEarned,
              referralLink: user.referralLink,
            },
          });

          referrer.totalPointsEarned =
            (referrer.totalPointsEarned || 0) + pointsToAdd;
          await referrer.save();
        }
      }

      res.status(200).json({
        success: true,
        message: "User eligibility updated successfully",
        user,
      });
    } catch (error) {
      console.error("Update eligibility error:", error);
      return next(new Errorhandler("Internal Server Error", 500));
    }
  }
);

export const updateUserRole = catchAsyncError(async (req, res, next) => {
  const { role } = req.body;
  const { userId } = req.params;
  if (!role) {
    return next(new Errorhandler("Status is required", 403));
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    return next(new Errorhandler("User not found", 404));
  }

  user.userRole = role;
  await user.save();

  res.status(200).json({ message: "User Verified successfully", user });
});

export const deleteUser = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  if (!userId) {
    return next(new Errorhandler("User ID is required!", 400));
  }

  const user = await UserModel.findByIdAndDelete(userId);

  if (!user) {
    return next(new Errorhandler("Error in deleting user!", 404));
  }

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  });
});
