import mongoose from "mongoose";

const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  expectedAmount: {
    type: Number,
    required: true,
    unique: true, // Each deposit has unique amount for matching
  },
  baseAmount: {
    type: Number,
  },
  category: {
    type: String,
    enum: ["Silver", "Gold", "Platinum"],
  },
  coin: {
    type: String,
    default: "USDT",
  },
  network: {
    type: String,
    default: "TRX", // TRC20
  },
  status: {
    type: String,
    enum: ["waiting", "completed", "expired"],
    default: "waiting",
  },
  binanceTxId: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  completedAt: {
    type: Date,
    default: null,
  },
});

// Index for faster queries
depositSchema.index({ userId: 1, status: 1 });
// expectedAmount already has unique index from schema definition
depositSchema.index({ binanceTxId: 1 });
depositSchema.index({ expiresAt: 1 });

export default mongoose.model("Deposit", depositSchema);
