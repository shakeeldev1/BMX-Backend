import DepositModel from "../Model/DepositModel.js";
import UserModel from "../Model/UserModel.js";
import BinanceService from "./BinanceService.js";
import SendMail from "./SendMail.js";

class DepositPollingService {
  constructor() {
    this.isRunning = false;
    this.pollInterval = 2 * 60 * 1000; // 2 minutes
    this.processedTxIds = new Set();
  }

  /**
   * Start the polling service
   */
  start() {
    if (this.isRunning) {
      console.log("Deposit polling service is already running");
      return;
    }

    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      console.log("Deposit polling service disabled: missing Binance API keys");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Deposit polling service started");
    
    // Run immediately on start
    this.poll();
    
    // Then run every 2 minutes
    this.intervalId = setInterval(() => {
      this.poll();
    }, this.pollInterval);
  }

  /**
   * Stop the polling service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.isRunning = false;
      console.log("Deposit polling service stopped");
    }
  }

  /**
   * Poll Binance for new deposits
   */
  async poll() {
    try {
      console.log("🔍 Polling Binance for new deposits...");

      // Get deposits from last 10 minutes
      const startTime = Date.now() - 10 * 60 * 1000;
      const deposits = await BinanceService.getDepositHistory(startTime);

      if (!deposits || deposits.length === 0) {
        console.log("No recent deposits found");
        return;
      }

      console.log(`Found ${deposits.length} recent deposit(s)`);

      // Process each deposit
      for (const binanceDeposit of deposits) {
        await this.processDeposit(binanceDeposit);
      }

      // Mark expired deposits
      await this.markExpiredDeposits();
    } catch (error) {
      console.error("Error polling deposits:", error);
    }
  }

  /**
   * Process a single Binance deposit
   */
  async processDeposit(binanceDeposit) {
    try {
      // Only process confirmed deposits
      if (binanceDeposit.status !== 1) {
        // Status 1 = success/confirmed in Binance
        return;
      }

      const txId = binanceDeposit.txId;
      const amount = parseFloat(binanceDeposit.amount);

      // Skip if already processed
      if (this.processedTxIds.has(txId)) {
        return;
      }

      // Check if this txId already exists in database
      const existingDeposit = await DepositModel.findOne({ binanceTxId: txId });
      if (existingDeposit) {
        this.processedTxIds.add(txId);
        return;
      }

      // Try to match with pending deposit intent
      const depositIntent = await DepositModel.findOne({
        expectedAmount: amount,
        status: "waiting",
        network: "TRX",
        expiresAt: { $gt: new Date() },
      });

      if (!depositIntent) {
        console.log(`No matching deposit intent found for amount: ${amount} USDT`);
        return;
      }

      console.log(`✅ Matched deposit: ${amount} USDT for user ${depositIntent.userId}`);

      // Update deposit record
      depositIntent.status = "completed";
      depositIntent.binanceTxId = txId;
      depositIntent.completedAt = new Date();
      await depositIntent.save();

      // Mark txId as processed
      this.processedTxIds.add(txId);

      // Update user eligibility and category
      const user = await UserModel.findById(depositIntent.userId);
      if (user) {
        // Set user as eligible (this is the investment/deposit requirement)
        if (!user.eligible) {
          const category = depositIntent.category || user.category;
          const baseAmount = depositIntent.baseAmount || amount;
          const rewardRate = category === "Silver" ? 0.25 : category ? 0.3 : 0;
          const rewardAmount = Math.round(baseAmount * rewardRate * 100) / 100;

          user.eligible = true;
          if (category) {
            user.category = category;
          }

          if (rewardAmount > 0) {
            const currentUSD =
              typeof user.convertedPointsInUSD === "number"
                ? user.convertedPointsInUSD
                : user.convertedPointsInPKR || 0;
            user.convertedPointsInUSD = currentUSD + rewardAmount;
            user.convertedPointsInPKR = user.convertedPointsInUSD;
          }

          await user.save();

          if (rewardAmount > 0 && user.referredBy) {
            const referrer = await UserModel.findById(user.referredBy);
            if (referrer) {
              const referrerUSD =
                typeof referrer.convertedPointsInUSD === "number"
                  ? referrer.convertedPointsInUSD
                  : referrer.convertedPointsInPKR || 0;
              referrer.convertedPointsInUSD = referrerUSD + rewardAmount;
              referrer.convertedPointsInPKR = referrer.convertedPointsInUSD;
              await referrer.save();
            }
          }

          console.log(`User ${user.email} is now eligible`);

          // Send success email to user
          const userEmail = user.email;
          const userSubject = "Deposit Confirmed - Account Activated";
          const userText = `Dear ${user.name},

Great news! Your deposit of ${amount} USDT has been confirmed.

Your account is now activated and you can start earning rewards!

Transaction ID: ${txId}

Best regards,
BMX Adventure Team`;

          await SendMail(userEmail, userSubject, userText);

          // Notify admin
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
            const adminSubject = "New Deposit Confirmed";
            const adminText = `Hello Admin,

A new deposit has been confirmed and processed automatically.

User: ${user.name}
Email: ${user.email}
Amount: ${amount} USDT
Transaction ID: ${txId}

The user has been marked as eligible.

Best regards,
BMX Adventure System`;

            await SendMail(adminEmail, adminSubject, adminText);
          }
        }
      }
    } catch (error) {
      console.error("Error processing deposit:", error);
    }
  }

  /**
   * Mark expired deposit intents
   */
  async markExpiredDeposits() {
    try {
      const result = await DepositModel.updateMany(
        {
          status: "waiting",
          expiresAt: { $lt: new Date() },
        },
        {
          $set: { status: "expired" },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`Marked ${result.modifiedCount} deposit(s) as expired`);
      }
    } catch (error) {
      console.error("Error marking expired deposits:", error);
    }
  }
}

export default new DepositPollingService();
