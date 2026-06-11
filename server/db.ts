import mongoose from 'mongoose';

const CommandSchema = new mongoose.Schema({
  command: { type: String, required: true, unique: true }, // e.g. /test
  description: { type: String },
  example: { type: String },
  isApi: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false }, // Paid command toggle
  isCreditBased: { type: Boolean, default: false }, // Credit based command toggle
  defaultDailyCredits: { type: Number, default: 0 }, // Default daily credits for users
  buyCreditsUrl: { type: String }, // Link for the "Buy Paid Credits" button
  creditPrice: { type: Number, default: 0 }, // Custom price (in ₹) for purchasing credits
  isForSale: { type: Boolean, default: false }, // Is this command credits package for sale
  pricePerCredit: { type: Number, default: 0 }, // Price per 1 credit (in ₹)
  minPurchaseCredits: { type: Number, default: 10 }, // Minimum credits required for checkout
  apiUrl: { type: String },
  autoDeleteMs: { type: Number, default: 0 },
  decoratedMessage: { type: String }, // support {{api.response}}
  inlineButtons: [{
    label: { type: String },
    url: { type: String }
  }],
  isMaintenance: { type: Boolean, default: false },
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  isBanned: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false }, // Paid user toggle (monthly)
  premiumExpiresAt: { type: Date }, // Subscription expiry date
  premiumTier: { type: String, default: null }, // Track subscribed tier ID (e.g. tier_gold)
  hasStartedBot: { type: Boolean, default: false }, // Has interacted privately
  interactions: { type: Number, default: 0 },
  commandCredits: [{ // Admin overrides for specific commands
    command: String,
    dailyLimit: Number,
    isUnlimited: Boolean
  }],
  commandUsage: [{ // Daily usage tracking
    command: String,
    used: Number,
    lastResetDate: String
  }],
  commonCredits: { type: Map, of: Number, default: {} },
  encCoins: { type: Number, default: 0 },
  groupCreditsLimit: { type: Number },
  isGroupUnlimited: { type: Boolean, default: false },
  groupCreditsUsed: { type: Number, default: 0 },
  groupCreditsLastReset: { type: String },
  rewardAdsLastWatch: { type: mongoose.Schema.Types.Mixed, default: {} },
  purchaseHistory: [{
    productId: { type: String },
    productName: { type: String },
    price: { type: Number },
    transactionId: { type: String },
    utr: { type: String },
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'Success' }
  }],
  interactedBots: [{ type: String }],
}, { timestamps: true });

const GroupSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  title: { type: String },
  ownerId: { type: String },
  isBanned: { type: Boolean, default: false },
  interactions: { type: Number, default: 0 },
  dailyLimit: { type: Number, default: 50 },  // Legacy, fallback if no owner
  dailyUsed: { type: Number, default: 0 },
  isUnlimited: { type: Boolean, default: false },
  lastResetDate: { type: String },
  memberCount: { type: Number, default: 0 },
  interactedBots: [{ type: String }]
}, { timestamps: true });

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

const StatlogSchema = new mongoose.Schema({
  commandName: { type: String, required: true },
  telegramId: { type: String, required: true },
  isGroup: { type: Boolean, default: false },
  paramValue: { type: String },
  apiResponse: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const PendingActionSchema = new mongoose.Schema({
  actionId: { type: String, required: true, unique: true },
  command: { type: String, required: true },
  param: { type: String },
  telegramId: { type: String, required: true },
  messageId: { type: Number },
  createdAt: { type: Date, expires: '24h', default: Date.now }
});

const UsedTransactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true }, // Can hold both txn_id or utr as safe identifier
  telegramId: { type: String, required: true },
  amount: { type: Number },
  type: { type: String },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

const BroadcastHistorySchema = new mongoose.Schema({
  message: { type: String, required: true },
  target: { type: String, required: true }, // 'all', 'users', 'groups', 'global_broadcast'
  totalUsers: { type: Number, default: 0 },
  successUsers: { type: Number, default: 0 },
  failedUsers: { type: Number, default: 0 },
  totalGroups: { type: Number, default: 0 },
  successGroups: { type: Number, default: 0 },
  failedGroups: { type: Number, default: 0 },
  timeTakenMs: { type: Number, default: 0 },
  status: { type: String, default: 'completed' }, // 'sending', 'completed', 'failed'
  isGlobal: { type: Boolean, default: false }
}, { timestamps: true });

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
  tierId: { type: String, required: true }, // specific tier id or 'all'
  maxUses: { type: Number, required: true, default: 5 },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const MirrorBotSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  botUsername: { type: String },
  botName: { type: String },
  ownerTelegramId: { type: String, required: true },
  plan: { type: String, default: 'free', enum: ['free', 'silver', 'gold', 'max'] },
  isActive: { type: Boolean, default: true },
  customBotName: { type: String },
  forceChannels: [{ type: mongoose.Schema.Types.Mixed }], // can contain {id, link} or string
  excludedCommands: [{ type: String }], // list of command names (e.g. ['/test'])
  customCommands: [{
    command: { type: String, required: true },
    description: { type: String },
    apiUrl: { type: String },
    isCreditBased: { type: Boolean, default: false },
    defaultDailyCredits: { type: Number, default: 0 },
    decoratedMessage: { type: String },
    autoDeleteMs: { type: Number, default: 0 }
  }],
  commandCreditsOverrides: [{
    command: String,
    dailyLimit: Number,
    autoDeleteMs: Number
  }],
  bannedUsers: [{ type: String, default: [] }],
  bannedGroups: [{ type: String, default: [] }],
  defaultGroupCredits: { type: Number, default: 50 },
  // track broadcast usage
  broadcastsToday: { type: Number, default: 0 },
  lastBroadcastDate: { type: String },
  expiresAt: { type: Date },
  integrationPointsUsed: { type: Number, default: 0 },
  integrationPointsMonth: { type: String, default: "" },
  isPointsExceeded: { type: Boolean, default: false }
}, { timestamps: true });

const MirrorWalletSchema = new mongoose.Schema({
  ownerTelegramId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  history: [{
    type: { type: String }, // 'earning', 'withdrawal_request', 'withdrawal_rejected', 'withdrawal_paid'
    amount: { type: Number, required: true },
    description: { type: String },
    status: { type: String }, // 'Pending', 'Paid', 'Rejected', 'N/A'
    date: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const MirrorWithdrawalRequestSchema = new mongoose.Schema({
  ownerTelegramId: { type: String, required: true },
  ownerUsername: { type: String },
  amount: { type: Number, required: true },
  upiId: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Paid', 'Rejected'], default: 'Pending' },
  screenshotUrl: { type: String },
  rejectionReason: { type: String },
  historyId: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

const DonationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount: { type: Number, required: true }, // value in the native unit (INR for upi, USD for crypto)
  method: { type: String, enum: ['upi', 'crypto'], required: true },
  utr: { type: String }, // Transaction ID / UTR / Hash
  cryptoCurrency: { type: String }, // e.g. USDT (TRC-20)
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
}, { timestamps: true });

export const Command = (mongoose.models.Command || mongoose.model('Command', CommandSchema, 'encore_commands')) as mongoose.Model<any>;
export const BotUser = (mongoose.models.BotUser || mongoose.model('BotUser', UserSchema, 'encore_users')) as mongoose.Model<any>;
export const BotGroup = (mongoose.models.BotGroup || mongoose.model('BotGroup', GroupSchema, 'encore_groups')) as mongoose.Model<any>;
export const Setting = (mongoose.models.Setting || mongoose.model('Setting', SettingSchema, 'encore_settings')) as mongoose.Model<any>;
export const Statlog = (mongoose.models.Statlog || mongoose.model('Statlog', StatlogSchema, 'encore_statlogs')) as mongoose.Model<any>;
export const PendingAction = (mongoose.models.PendingAction || mongoose.model('PendingAction', PendingActionSchema, 'encore_pending_actions')) as mongoose.Model<any>;
export const UsedTransaction = (mongoose.models.UsedTransaction || mongoose.model('UsedTransaction', UsedTransactionSchema, 'encore_used_transactions')) as mongoose.Model<any>;
export const BroadcastHistory = (mongoose.models.BroadcastHistory || mongoose.model('BroadcastHistory', BroadcastHistorySchema, 'encore_broadcast_history')) as mongoose.Model<any>;
export const Coupon = (mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema, 'encore_coupons')) as mongoose.Model<any>;
export const MirrorBot = (mongoose.models.MirrorBot || mongoose.model('MirrorBot', MirrorBotSchema, 'encore_mirror_bots')) as mongoose.Model<any>;
export const MirrorWallet = (mongoose.models.MirrorWallet || mongoose.model('MirrorWallet', MirrorWalletSchema, 'encore_mirror_wallets')) as mongoose.Model<any>;
export const MirrorWithdrawalRequest = (mongoose.models.MirrorWithdrawalRequest || mongoose.model('MirrorWithdrawalRequest', MirrorWithdrawalRequestSchema, 'encore_mirror_withdrawal_requests')) as mongoose.Model<any>;
export const Donation = (mongoose.models.Donation || mongoose.model('Donation', DonationSchema, 'encore_donations')) as mongoose.Model<any>;

let cachedAppUrl: string | null = null;
export function getCachedAppUrl(): string | null {
  return cachedAppUrl;
}
export function setCachedAppUrl(url: string | null) {
  cachedAppUrl = url;
}

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    if (!cachedAppUrl) {
      try {
        const s = await mongoose.models.Setting.findOne({ key: 'appUrl' });
        if (s && s.value) {
          cachedAppUrl = String(s.value);
        }
      } catch (e) {}
    }
    return;
  }
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI is not set. Database operations will fail.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Connected successfully");
    
    // Cache the application public webapp url dynamically
    try {
      const s = await mongoose.models.Setting.findOne({ key: 'appUrl' });
      if (s && s.value) {
        cachedAppUrl = String(s.value);
        console.log(`[Database Startup] Loaded cached webapp public URL: ${cachedAppUrl}`);
      }
    } catch (err) {}
  } catch (error) {
    console.error("MongoDB connection Error:", error);
  }
}
