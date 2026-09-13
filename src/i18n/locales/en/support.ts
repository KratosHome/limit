export default {
  title: 'Help shape Limit',
  description: 'Share an idea, report a problem or support the project.',
  feedback: {
    title: 'Send feedback',
    description: 'Your experience helps decide what to improve next.',
    healthTitle: 'What would make this useful?',
    healthDescription:
      'Tell us what you would like to see in Health & fitness.',
    message: 'Your message',
    placeholder: 'An idea, a problem or something you would like to change…',
    contact: 'Contact · optional',
    contactPlaceholder: 'Email or another way to reach you',
    contactHint: 'Leave a contact if you would like a reply.',
    privacy:
      'The developer receives your message, optional contact and page name in Telegram. Health data and activity history are not attached.',
    send: 'Send feedback',
    sending: 'Sending…',
    sent: 'Your message was sent.',
    unavailable:
      'Sending feedback is temporarily unavailable. You can keep a draft here or share your idea on GitHub.',
    checking: 'Checking whether feedback is available…',
    retry: 'Check again',
    draft: 'Your draft stays here during this app session.',
    characters: '{{count}} / 3,000',
    invalidMessage: 'Write between 10 and 3,000 characters.',
    invalidContact: 'Keep the contact under 200 characters.',
  },
  donation: {
    title: 'Support development',
    description:
      'If Limit is useful to you, you can help its development with an optional contribution.',
    action: 'Support Limit',
    unavailable: 'A contribution link is being prepared.',
  },
  github: {
    title: 'Build it together',
    description:
      'Explore the code, suggest an improvement or contribute to Limit on GitHub.',
    action: 'Open GitHub',
  },
  errors: {
    feedbackInvalid:
      'Check the message and contact, then try again. Your draft is still here.',
    feedbackRateLimited:
      'Please wait before sending another message. Your draft is still here.',
    feedbackUnavailable:
      'Could not confirm that your message was sent. Your draft is still here; try again later.',
    supportLinkUnavailable: 'Could not open the link. Please try again later.',
  },
} as const;
