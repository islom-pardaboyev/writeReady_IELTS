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
  writeBatch,
  increment,
  getCountFromServer,
  type DocumentReference,
  type Firestore,
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

export async function getBlogPosts(status?: string, dbInstance: Firestore = db): Promise<BlogPost[]> {
  const col = collection(dbInstance, 'blogPosts');
  const q = status
    ? query(col, where('status', '==', status), orderBy('publishedAt', 'desc'))
    : query(col, orderBy('publishedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => postFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  // The rules only let students read published posts, and Firestore refuses a
  // query that could return anything else, so the status filter is required.
  const q = query(
    collection(db, 'blogPosts'),
    where('slug', '==', slug),
    where('status', '==', 'published'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return postFromDoc(d.id, d.data() as Record<string, unknown>);
}

export async function getBlogPostById(id: string, dbInstance: Firestore = db): Promise<BlogPost | null> {
  const snap = await getDoc(doc(dbInstance, 'blogPosts', id));
  if (!snap.exists()) return null;
  return postFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function saveBlogPost(data: Omit<BlogPost, 'id'>, dbInstance: Firestore = db): Promise<string> {
  const ref = await addDoc(collection(dbInstance, 'blogPosts'), {
    ...data,
    publishedAt: data.publishedAt ?? serverTimestamp(),
    viewCount: data.viewCount ?? 0,
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
  });
  return ref.id;
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>, dbInstance: Firestore = db): Promise<void> {
  await updateDoc(doc(dbInstance, 'blogPosts', id), data as Record<string, unknown>);
}

export async function deleteBlogPost(id: string, dbInstance: Firestore = db): Promise<void> {
  await deleteDoc(doc(dbInstance, 'blogPosts', id));
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
  // The post's commentCount is not touched from here any more: firestore.rules
  // does not let a student write it. The admin panel counts comments itself
  // (countComments below).
  const ref = await addDoc(collection(db, 'blogPosts', postId, 'comments'), {
    ...comment,
    createdAt: serverTimestamp(),
    likeCount: 0,
  });
  return ref.id;
}

/** How many comments a post has, counted by the database. For the admin panel. */
export async function countComments(postId: string, dbInstance: Firestore = db): Promise<number> {
  const snap = await getCountFromServer(collection(dbInstance, 'blogPosts', postId, 'comments'));
  return snap.data().count;
}

/**
 * Likes or unlikes, and moves the counter, in ONE batch. firestore.rules
 * (likeStepOk) only lets a counter move by one together with the like document
 * itself, so the two writes have to travel together. increment() adds to
 * whatever the database holds, so two people liking at once both count.
 * A count that has drifted to zero stays at zero when a like is taken back.
 */
async function toggleLike(likeRef: DocumentReference, counterRef: DocumentReference, userId: string): Promise<{ liked: boolean; count: number }> {
  const [likeSnap, counterSnap] = await Promise.all([getDoc(likeRef), getDoc(counterRef)]);
  const stored = Number((counterSnap.data() as Record<string, unknown> | undefined)?.likeCount ?? 0);
  const current = Number.isFinite(stored) ? stored : 0;
  const batch = writeBatch(db);
  if (likeSnap.exists()) {
    const next = Math.max(0, current - 1);
    batch.delete(likeRef);
    batch.update(counterRef, { likeCount: increment(next - current) });
    await batch.commit();
    return { liked: false, count: next };
  }
  batch.set(likeRef, { userId, createdAt: serverTimestamp() });
  batch.update(counterRef, { likeCount: increment(1) });
  await batch.commit();
  return { liked: true, count: current + 1 };
}

export async function toggleCommentLike(
  postId: string,
  commentId: string,
  userId: string,
): Promise<number> {
  const likeRef = doc(db, 'blogPosts', postId, 'comments', commentId, 'likes', userId);
  const commentRef = doc(db, 'blogPosts', postId, 'comments', commentId);
  return (await toggleLike(likeRef, commentRef, userId)).count;
}

export async function togglePostLike(postId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, 'blogPosts', postId, 'likes', userId);
  const postRef = doc(db, 'blogPosts', postId);
  return (await toggleLike(likeRef, postRef, userId)).liked;
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
      type: (data.type as Notification['type']) ?? 'like',
      fromUserName: (data.fromUserName as string) ?? '',
      postId: (data.postId as string) ?? '',
      postSlug: (data.postSlug as string) ?? '',
      commentId: (data.commentId as string) ?? undefined,
      reviewId: (data.reviewId as string) ?? undefined,
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
  // The id is fixed by the like, so one like makes one notification. A second
  // like on the same comment (like, unlike, like) is refused by firestore.rules,
  // which is the point: nobody can flood an author. The text is capped there too.
  await setDoc(doc(db, 'notifications', commentAuthorId, 'items', `like_${commentId}_${fromUserId}`), {
    type: 'like',
    fromUserName: fromUserName.slice(0, 80),
    postId,
    postSlug: postSlug.slice(0, 120),
    commentId,
    preview: preview.slice(0, 100),
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
