import { useState } from 'react';
import { useAuth } from './useAuth';
import { createHumanReview } from '../firebase/teachers';
import type { HumanReview, HumanReviewTaskPart, Teacher } from '../types';

interface HumanCheckParts {
  task1?: HumanReviewTaskPart;
  task2?: HumanReviewTaskPart;
}

export function useHumanCheck(mode: HumanReview['mode']) {
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingParts, setPendingParts] = useState<HumanCheckParts | null>(null);

  const requestHumanCheck = (parts: HumanCheckParts) => {
    setPendingParts(parts);
    setError(null);
    setSuccess(false);
    setShowPicker(true);
  };

  const closePicker = () => {
    if (submitting) return;
    setShowPicker(false);
  };

  const handleSelectTeacher = async (teacher: Teacher) => {
    if (!user || !pendingParts) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const preCheckRes = await fetch('/api/pre-check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const preCheckData = await preCheckRes.json();
      if (!preCheckRes.ok) throw new Error(preCheckData.error || 'Could not verify your plan.');

      await createHumanReview({
        uid: user.uid,
        studentName: user.displayName || user.email || 'Student',
        studentEmail: user.email || '',
        teacherId: teacher.id,
        teacherName: teacher.name,
        mode,
        task1: pendingParts.task1,
        task2: pendingParts.task2,
      });

      setSuccess(true);
      setShowPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your essay. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return { showPicker, submitting, error, success, setSuccess, requestHumanCheck, closePicker, handleSelectTeacher };
}
