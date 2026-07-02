export type SocialPostStatus =
  | "pending_review"
  | "approved_to_post"
  | "posted"
  | "rejected"
  | "needs_review";

export type SocialPostAction =
  | "staged"
  | "approved"
  | "rejected"
  | "posted"
  | "skipped";

export type SocialPostFrame = {
  url: string;
  filename: string;
  order: number;
};

export type SocialPostLegislatorSocial = {
  platform: "X" | "Facebook" | "Instagram" | "Official" | "Campaign";
  handle?: string;
  url: string;
};

export type SocialPostLegislator = {
  level: "congress" | "state_senate" | "state_house";
  party: "D" | "R" | "I" | "NP" | null;
  name: string;
  title: string;
  handle?: string;
  profile_url?: string;
  socials?: SocialPostLegislatorSocial[];
  note?: string;
};

export type SocialPostCaptions = {
  facebook: string;
  instagram: string;
  x: string;
  /** Copy for sharing from the business FB page to your professional/profile page. */
  firstComment: string;
  /** Legislator follow + tag block for manual FB/IG first comments. */
  legislatorComment?: string;
  locationTag: string;
};

export type SocialPostPackage = {
  actor_bucket_key: string;
  content_signature?: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  county: string | null;
  family_count: number;
  frames: SocialPostFrame[];
  captions: SocialPostCaptions;
  legislators: SocialPostLegislator[];
  stats: {
    state_family_count: number | null;
    median_financial_loss: number | null;
    pro_se_pct: number | null;
    median_months_lost: number | null;
    movement_total: number | null;
  };
  quotes: Array<{
    text: string;
    attribution: string;
  }>;
  share_url: string;
  /** Canonical hero portrait path (image_1080.png) for email + Blotato. */
  hero_url: string;
  spec_source: string;
  /** True when spec.json marks a verified portrait (slide 1 should show a face). */
  portrait_verified?: boolean;
};

export type QueuedSocialPost = {
  id: string;
  actor_bucket_key: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  county: string | null;
  status: SocialPostStatus;
  package_json: SocialPostPackage;
  email_thread_id: string | null;
  email_message_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};
