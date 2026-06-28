import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { BlogPost, BlogComment, Notification } from '../types/blog';

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return null;
}

function postFromDoc(id: string, data: Record<string, unknown>): BlogPost {
  return {
    id,
    title: (data.title as string) ?? '',
    slug: (data.slug as string) ?? '',
    excerpt: (data.excerpt as string) ?? '',
    content: (data.content as string) ?? '',
    featuredImage: (data.featuredImage as string) ?? '',
    category: (data.category as BlogPost['category']) ?? 'News',
    tags: (data.tags as string[]) ?? [],
    seo: (data.seo as BlogPost['seo']) ?? { metaTitle: '', metaDescription: '', focusKeyword: '' },
    status: (data.status as BlogPost['status']) ?? 'draft',
    publishedAt: toDate(data.publishedAt),
    author: (data.author as string) ?? '',
    ctaText: (data.ctaText as string) ?? '',
    ctaLink: (data.ctaLink as string) ?? '',
    viewCount: (data.viewCount as number) ?? 0,
    likeCount: (data.likeCount as number) ?? 0,
    commentCount: (data.commentCount as number) ?? 0,
  };
}

export async function getBlogPosts(status?: string): Promise<BlogPost[]> {
  const col = collection(db, 'blogPosts');
  const q = status
    ? query(col, where('status', '==', status), orderBy('publishedAt', 'desc'))
    : query(col, orderBy('publishedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => postFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const q = query(collection(db, 'blogPosts'), where('slug', '==', slug), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return postFromDoc(d.id, d.data() as Record<string, unknown>);
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  const snap = await getDoc(doc(db, 'blogPosts', id));
  if (!snap.exists()) return null;
  return postFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function saveBlogPost(data: Omit<BlogPost, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'blogPosts'), {
    ...data,
    publishedAt: data.publishedAt ?? serverTimestamp(),
    viewCount: data.viewCount ?? 0,
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
  });
  return ref.id;
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>): Promise<void> {
  await updateDoc(doc(db, 'blogPosts', id), data as Record<string, unknown>);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await deleteDoc(doc(db, 'blogPosts', id));
}

export async function getComments(postId: string): Promise<BlogComment[]> {
  const q = query(
    collection(db, 'blogPosts', postId, 'comments'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      userId: (data.userId as string) ?? '',
      displayName: (data.displayName as string) ?? '',
      photoURL: (data.photoURL as string) ?? '',
      text: (data.text as string) ?? '',
      createdAt: toDate(data.createdAt),
      likeCount: (data.likeCount as number) ?? 0,
    };
  });
}

export async function addComment(
  postId: string,
  comment: Omit<BlogComment, 'id' | 'createdAt' | 'likeCount'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'blogPosts', postId, 'comments'), {
    ...comment,
    createdAt: serverTimestamp(),
    likeCount: 0,
  });
  // increment commentCount
  const postRef = doc(db, 'blogPosts', postId);
  const postSnap = await getDoc(postRef);
  if (postSnap.exists()) {
    const count = ((postSnap.data() as Record<string, unknown>).commentCount as number) ?? 0;
    await updateDoc(postRef, { commentCount: count + 1 });
  }
  return ref.id;
}

export async function toggleCommentLike(
  postId: string,
  commentId: string,
  userId: string,
): Promise<number> {
  const likeRef = doc(db, 'blogPosts', postId, 'comments', commentId, 'likes', userId);
  const commentRef = doc(db, 'blogPosts', postId, 'comments', commentId);
  const likeSnap = await getDoc(likeRef);
  const commentSnap = await getDoc(commentRef);
  const current = ((commentSnap.data() as Record<string, unknown>)?.likeCount as number) ?? 0;
  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    const newCount = Math.max(0, current - 1);
    await updateDoc(commentRef, { likeCount: newCount });
    return newCount;
  } else {
    await setDoc(likeRef, { userId, createdAt: serverTimestamp() });
    const newCount = current + 1;
    await updateDoc(commentRef, { likeCount: newCount });
    return newCount;
  }
}

export async function togglePostLike(postId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, 'blogPosts', postId, 'likes', userId);
  const postRef = doc(db, 'blogPosts', postId);
  const likeSnap = await getDoc(likeRef);
  const postSnap = await getDoc(postRef);
  const current = ((postSnap.data() as Record<string, unknown>)?.likeCount as number) ?? 0;
  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likeCount: Math.max(0, current - 1) });
    return false;
  } else {
    await setDoc(likeRef, { userId, createdAt: serverTimestamp() });
    await updateDoc(postRef, { likeCount: current + 1 });
    return true;
  }
}

export async function isPostLiked(postId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, 'blogPosts', postId, 'likes', userId);
  const snap = await getDoc(likeRef);
  return snap.exists();
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const q = query(
    collection(db, 'notifications', userId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      type: (data.type as 'like' | 'comment') ?? 'like',
      fromUserName: (data.fromUserName as string) ?? '',
      postId: (data.postId as string) ?? '',
      postSlug: (data.postSlug as string) ?? '',
      commentId: (data.commentId as string) ?? undefined,
      preview: (data.preview as string) ?? '',
      read: (data.read as boolean) ?? false,
      createdAt: toDate(data.createdAt),
    };
  });
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const q = query(
    collection(db, 'notifications', userId, 'items'),
    where('read', '==', false),
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
}

export async function createLikeNotification(
  postId: string,
  postSlug: string,
  commentId: string,
  commentAuthorId: string,
  fromUserId: string,
  fromUserName: string,
  preview: string,
): Promise<void> {
  if (commentAuthorId === fromUserId) return;
  await addDoc(collection(db, 'notifications', commentAuthorId, 'items'), {
    type: 'like',
    fromUserName,
    postId,
    postSlug,
    commentId,
    preview,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const q = query(
    collection(db, 'notifications', userId, 'items'),
    where('read', '==', false),
  );
  const snap = await getDocs(q);
  return snap.size;
}
