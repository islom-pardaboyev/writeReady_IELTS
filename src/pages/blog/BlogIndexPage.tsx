import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { getBlogPosts } from '../../firebase/blog';
import type { BlogPost } from '../../types/blog';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';

const CATEGORIES = ['All', 'Writing tips', 'Vocabulary', 'Band score', 'Grammar', 'News'] as const;

function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function readTime(content: string): number {
  return Math.ceil(content.split(' ').length / 200);
}

export function BlogIndexPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  useEffect(() => {
    document.title = 'IELTS Blog | WriteReady';
    getBlogPosts('published').then((p) => {
      setPosts(p);
      setLoading(false);
    });
  }, []);

  const filtered = activeCategory === 'All'
    ? posts
    : posts.filter((p) => p.category === activeCategory);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">IELTS Blog</h1>
        <p className="text-[var(--text-secondary)] mb-8">Tips, strategies and insights for IELTS success.</p>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-blue-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-secondary)]">
            <p className="text-5xl mb-4">📝</p>
            <p className="text-lg font-medium">No posts yet</p>
            <p className="text-sm mt-1">Check back soon for IELTS tips and guides.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="no-underline group"
              >
                <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
                  {post.featuredImage ? (
                    <img
                      src={post.featuredImage}
                      alt={post.title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-4xl">📝</span>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <Badge variant="info" className="mb-2 text-[0.7rem] uppercase tracking-wide">
                      {post.category}
                    </Badge>
                    <h2 className="text-base font-bold text-[var(--text-primary)] group-hover:text-blue-600 transition-colors mb-1 line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span>{post.author}</span>
                      <span className="flex items-center gap-2">
                        <span>{formatDate(post.publishedAt)}</span>
                        <span>·</span>
                        <span>{readTime(post.content)} min read</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
