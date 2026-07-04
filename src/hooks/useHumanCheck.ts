import { useState } from 'react';
import { useAuth } from './useAuth';
import { createHumanReview, InsufficientBalanceError } from '../firebase/teachers';
import { getHumanCheckPrice, getHumanCheckPlatformFee } from './useFeatureFlag';
import type { HumanReview, HumanReviewTaskPart, Teacher } from '../types';

interface HumanCheckParts {
  task1?: HumanReviewTaskPart;
  task2?: HumanReviewTaskPart;
}

export function useHumanCheck(mode: HumanReview['mode']) {
  const { user, profile, refreshProfile } = useAuth();
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [platformFee, setPlatformFee] = useState(0);
  const [priceLoading, setPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingParts, setPendingParts] = useState<HumanCheckParts | null>(null);

  const balance = profile?.balanceUZS ?? 0;
  const canAfford = price !== null && balance >= price;

  const requestHumanCheck = async (parts: HumanCheckParts) => {
    setPendingParts(parts);
    setError(null);
    setSuccess(false);
    setPriceLoading(true);
    setShowCostConfirm(true);
    try {
      const [p, fee] = await Promise.all([getHumanCheckPrice(), getHumanCheckPlatformFee()]);
      setPrice(p);
      setPlatformFee(fee);
    } catch {
      setError('Could not load the Human Check price. Please try again.');
      setShowCostConfirm(false);
    } finally {
      setPriceLoading(false);
    }
  };

  const cancelCostConfirm = () => {
    setShowCostConfirm(false);
    setPendingParts(null);
  };

  const confirmCost = () => {
    setShowCostConfirm(false);
    setShowPicker(true);
  };

  const closePicker = () => {
    if (submitting) return;
    setShowPicker(false);
  };

  const handleSelectTeacher = async (teacher: Teacher) => {
    if (!user || !pendingParts || price === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await createHumanReview({
        uid: user.uid,
        studentName: user.displayName || user.email || 'Student',
        studentEmail: user.email || '',
        teacherId: teacher.id,
        teacherName: teacher.name,
        mode,
        task1: pendingParts.task1,
        task2: pendingParts.task2,
      }, price, platformFee);

      await refreshProfile();
      setSuccess(true);
      setShowPicker(false);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        setError('Your balance is too low for this. Please top up and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not send your essay. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    showCostConfirm, priceLoading, price, balance, canAfford, cancelCostConfirm, confirmCost,
    showPicker, submitting, error, success, setSuccess, requestHumanCheck, closePicker, handleSelectTeacher,
  };
}
