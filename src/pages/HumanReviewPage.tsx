import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { getHumanReview } from "../firebase/teachers";
import { base64ToBlob, downloadBlob } from "../lib/reviewDocx";
import type { HumanReview } from "../types";
import { GraduationCap, Download, Clock } from "lucide-react";

export function HumanReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [review, setReview] = useState<HumanReview | null | undefined>(undefined);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!id || !user) return;
    getHumanReview(id).then((r) => {
      if (r && r.uid === user.uid) setReview(r);
      else setReview(null);
    });
  }, [id, user]);

  const handleDownload = () => {
    if (!review?.feedbackDocBase64) return;
    const blob = base64ToBlob(
      review.feedbackDocBase64,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    downloadBlob(blob, review.feedbackFileName || "feedback.docx");
  };

  if (review === undefined) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (review === null) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <p className="text-[var(--text-secondary)]">This review could not be found.</p>
          <Link to="/dashboard" className="text-blue-600 text-sm font-medium">Back to dashboard</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-12 min-h-[calc(100vh-120px)] bg-[var(--bg-base)]">
        <div className="container mx-auto max-w-[560px] px-6">
          <Card className="p-8 text-center">
            <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-emerald-50 mb-4">
              <GraduationCap className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Human Check</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Reviewed by {review.teacherName} · {[review.task1 && "Task 1", review.task2 && "Task 2"].filter(Boolean).join(" & ")}
            </p>

            {review.status === "pending" ? (
              <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg py-3 px-4 text-sm font-medium">
                <Clock className="w-4 h-4" />
                Your teacher hasn't reviewed this yet.
              </div>
            ) : (
              <Button onClick={handleDownload} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Download className="w-4 h-4 mr-1.5" />
                Download feedback (.docx)
              </Button>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
