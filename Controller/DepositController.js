import { catchAsyncError } from "../MiddleWare/CatchAsyncError.js";
import DepositModel from "../Model/DepositModel.js";
import UserModel from "../Model/UserModel.js";
import SendMail from "../Utils/SendMail.js";
import BinanceService from "../Utils/BinanceService.js";


/**
 * Generate a unique deposit amount
 * Amount will be between 3.01 and 3.99 to ensure uniqueness
 */
const generateUniqueAmount = async () => {
  let isUnique = false;
  let amount;
  let attempts = 0;
  const maxAttempts = 100;

  while (!isUnique && attempts < maxAttempts) {
    // Generate amount between 3.01 and 3.99 for testing
    const cents = Math.floor(Math.random() * 99) + 1;
    amount = 3 + cents / 100;
    amount = Math.round(amount * 100) / 100; // Ensure 2 decimal places

    // Check if this amount already exists in pending deposits
    const existing = await DepositModel.findOne({
      expectedAmount: amount,
      status: "waiting",
    });

    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error("Unable to generate unique deposit amount. Please try again.");
  }

  return amount;
};

/**
 * Create a new deposit intent
 */
export const createDepositIntent = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized request.",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if user already has a pending deposit
    const existingPending = await DepositModel.findOne({
      userId,
      status: "waiting",
      expiresAt: { $gt: new Date() },
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending deposit request.",
        deposit: existingPending,
      });
    }

    // Generate unique amount
    const expectedAmount = await generateUniqueAmount();

    // Create deposit intent (expires in 30 minutes)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const deposit = await DepositModel.create({
      userId,
      expectedAmount,
      expiresAt,
    });

    // Fetch deposit address from Binance API dynamically
    let depositAddress;
    try {
      depositAddress = await BinanceService.getDepositAddress('USDT', 'TRX');
      console.log('Fetched deposit address from Binance:', depositAddress);
    } catch (binanceError) {
      console.error('Error fetching deposit address from Binance:', binanceError);
      // Fallback to env variable if Binance API fails
      depositAddress = process.env.BINANCE_ADMIN_DEPOSIT_ADDRESS;
      console.log('Using fallback address from .env');
    }

    // Send email to user
    const userEmail = user.email;
    const userSubject = "Deposit Request Created";
    const userText = `Dear ${user.name},

Your deposit request has been created successfully.

Deposit Instructions:
- Coin: USDT
- Network: TRC20
- Address: ${depositAddress}
- Exact Amount: ${expectedAmount} USDT

⚠️ IMPORTANT: Please send EXACTLY ${expectedAmount} USDT to ensure automatic processing.

This deposit request will expire in 30 minutes.

Best regards,
BMX Adventure Team`;

    await SendMail(userEmail, userSubject, userText);

    return res.status(200).json({
      success: true,
      message: "Deposit request created successfully.",
      deposit: {
        expectedAmount,
        coin: "USDT",
        network: "TRC20",
        address: depositAddress,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("Create deposit intent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Get user's deposit status
 */
export const getDepositStatus = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized request.",
      });
    }

    // Get user's most recent pending deposit
    const pendingDeposit = await DepositModel.findOne({
      userId,
      status: "waiting",
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      deposit: pendingDeposit,
    });
  } catch (error) {
    console.error("Get deposit status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Get user's deposit history
 */
export const getUserDepositHistory = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized request.",
      });
    }

    const deposits = await DepositModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json({
      success: true,
      deposits,
    });
  } catch (error) {
    console.error("Get deposit history error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

/**
 * Get all deposits (Admin only)
 */
export const getAllDeposits = catchAsyncError(async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const deposits = await DepositModel.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalDeposits = await DepositModel.countDocuments(query);

    return res.status(200).json({
      success: true,
      totalDeposits,
      page: parseInt(page),
      limit: parseInt(limit),
      deposits,
    });
  } catch (error) {
    console.error("Get all deposits error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});
