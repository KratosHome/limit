export interface SupportConfig {
  feedbackAvailable: boolean;
  donationAvailable: boolean;
}

export interface FeedbackInput {
  message: string;
  contact?: string;
  source: 'health' | 'settings';
}

export type SupportLink = 'github' | 'donate';
