export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  category: 'Writing tips' | 'Vocabulary' | 'Band score' | 'Grammar' | 'News';
  tags: string[];
  seo: { metaTitle: string; metaDescription: string; focusKeyword: string };
  status: 'draft' | 'published' | 'scheduled';
  publishedAt: Date | null;
  author: string;
  ctaText?: string;
  ctaLink?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface BlogComment {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string;
  text: string;
  createdAt: Date | null;
  likeCount: number;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment';
  fromUserName: string;
  postId: string;
  postSlug: string;
  commentId?: string;
  preview: string;
  read: boolean;
  createdAt: Date | null;
}
