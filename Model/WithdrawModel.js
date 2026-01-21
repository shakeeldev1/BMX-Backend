import mongoose from "mongoose";

const withdrawSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected", "Processing", "Completed", "Failed"],
    default: "Pending",
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  // Binance withdrawal fields
  walletAddress: {
    type: String,
    default: null,
  },
  network: {
    type: String,
    default: "TRC20",
  },
  binanceTxId: {
    type: String,
    default: null,
  },
  binanceStatus: {
    type: String,
    enum: ["pending", "processing", "completed", "failed", null],
    default: null,
  },
});


export default mongoose.model("Withdraw", withdrawSchema);