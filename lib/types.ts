export type Language = "bn" | "en";

export interface PublicProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  badge_label: string | null;
  is_social_verified?: boolean;
  referral_code: string;
  created_at: string;
  is_suspended: boolean;
}

export interface Membership {
  user_id: string;
  status: "locked" | "active" | "deactivated";
  activated_at: string | null;
  activation_source: string | null;
}

export interface SiteGeneralSettings {
  siteName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  currency: string;
  activationPrice: number | null;
  socialVerificationPrice: number | null;
  activationGateScope: string;
  memberBadgeWording: string;
  withdrawalMinimum: number;
  payoutMethods: string[];
  paymentGatewayStatus: "not_configured" | "configured";
  paymentPendingMessage: string;
  generalNotice: string;
  aboutContent: string;
  aboutContentBn: string;
  privacyContent: string;
  privacyContentBn: string;
  termsContent: string;
  termsContentBn: string;
}

export interface SupportSettings {
  enabled: boolean;
  label: string;
  iconUrl: string | null;
  contactUrl: string | null;
  phone: string | null;
  position: "left" | "right";
}

export interface Banner {
  id: string;
  title: string | null;
  image_url: string | null;
  destination_url: string | null;
  sort_order: number;
}

export interface AnnouncementTicker {
  id: string;
  text_en: string;
  text_bn: string | null;
  icon: string | null;
  destination_url: string | null;
  text_color: string;
  background_color: string;
  direction: "ltr" | "rtl";
  speed_seconds: number;
  sort_order: number;
}

export interface ServiceLink {
  id: string;
  label_en: string;
  label_bn: string | null;
  icon_name: string | null;
  icon_url: string | null;
  destination_url: string;
  sort_order: number;
}

export interface ProjectCard {
  id: string;
  title_en: string;
  title_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  image_url: string | null;
  icon_name: string | null;
  destination_url: string | null;
  sort_order: number;
}

export interface JobPreview {
  id: string;
  job_code: string;
  title_en: string;
  title_bn: string | null;
  short_description_en: string | null;
  short_description_bn: string | null;
  category: string;
  thumbnail_url: string | null;
  reward: number;
  max_slots: number;
  completed_count: number;
  deadline: string | null;
  sort_order: number;
}

export interface JobDetail extends JobPreview {
  full_instructions_en: string;
  full_instructions_bn: string | null;
  instruction_image_url: string | null;
  target_url: string;
  proof_requirements: {
    text?: boolean;
    url?: boolean;
    images?: boolean;
    maxImages?: number;
  };
  allow_resubmission: boolean;
}

export interface FeedPost {
  id: string;
  author_id: string;
  body: string | null;
  external_url: string | null;
  is_pinned: boolean;
  created_at: string;
  author: PublicProfile;
  media: Array<{ id: string; storage_path: string; public_url: string | null; sort_order: number }>;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  connection_status?: "none" | "pending" | "connected";
}

export interface WalletSummary {
  balance: number;
  today: number;
  yesterday: number;
  last_7_days: number;
  last_30_days: number;
}

export interface NetworkLevel {
  level: number;
  total: number;
  active: number;
  inactive: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  destination_url: string | null;
  read_at: string | null;
  created_at: string;
}
