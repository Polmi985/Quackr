import { NextRequest, NextResponse } from 'next/server';
import { updateUserGameScore } from '@/lib/swipeScoreService';
import { addReadArticle } from '@/lib/userReadArticlesService';
import { awardSwipeCoins } from '@/lib/coinService';
import { getUserStreak } from '@/lib/userStreakService';
import { getActiveEffects, getScoreMultiplier, getCoinMultiplier, consumeSwipeEffects, decrementEffect, isEffectActive } from '@/lib/activeEffectsService';
import { getItemQuantity } from '@/lib/userInventoryService';
import { getArticleById } from '@/lib/articleService';
import { submitWeeklyScore } from '@/lib/weeklyLeaderboardService';
import { requireUser } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
  try {
    // The user is identified by their verified Firebase ID token, never by the request body.
    const auth = await requireUser(request);
    if (auth.error) return auth.error;
    const userId = auth.user.uid;

    const body = await request.json();
    const { articleId, direction, articleTitle, sessionId, displayName, url, useSkip } = body;

    if (!userId || !articleId || !direction) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Handle skip — must have skip tokens
    if (direction === 'up' || useSkip) {
      const skipQty = await getItemQuantity(userId, 'article_skip_1');
      if (skipQty <= 0) {
        return NextResponse.json({ error: 'Nemáš žádné přeskočení. Kup si je v obchodě.', needsSkipToken: true }, { status: 403 });
      }
      // Consume skip token
      const { useItem } = await import('@/lib/userInventoryService');
      await useItem(userId, 'article_skip_1');

      return NextResponse.json({
        success: true,
        direction: 'up',
        skipped: true,
        skipTokensRemaining: skipQty - 1,
      });
    }

    if (direction !== 'left' && direction !== 'right') {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }

    // ── Server-side article verification ──
    // The real isFake/category values always come from Firestore; client-provided
    // values are ignored so the score cannot be manipulated.
    const article = await getArticleById(articleId);
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    const verifiedIsFake = article.isFake ?? false;
    const verifiedCategory = article.category;

    // Get active effects
    const effects = await getActiveEffects(userId);
    const scoreMultiplier = getScoreMultiplier(effects);
    const coinMultiplier = getCoinMultiplier(effects);
    const hasSafetyNet = isEffectActive(effects, 'safety_net_1');

    const isCorrect = (direction === 'right' && !verifiedIsFake) || (direction === 'left' && verifiedIsFake);

    // Safety net — if wrong answer and safety net active, block the negative
    let safetyNetUsed = false;
    if (!isCorrect && hasSafetyNet) {
      await decrementEffect(userId, 'safety_net_1');
      safetyNetUsed = true;
    }

    // Update score (apply multiplier for correct swipes)
    // Safety net turns a wrong answer into the correct one (left for fake, right for real).
    const correctDirection = verifiedIsFake ? 'left' : 'right';
    const effectiveDirection = safetyNetUsed ? correctDirection : direction;
    await updateUserGameScore(userId, effectiveDirection, articleId, sessionId, displayName, verifiedIsFake, verifiedCategory);

    // Save to read list
    await addReadArticle(userId, articleId, articleTitle || 'Untitled', verifiedIsFake || false, url);

    // Award coins (apply coin multiplier)
    const effectiveCorrect = safetyNetUsed ? true : isCorrect;
    let coinResult = { coinsAwarded: 0, breakdown: [] as string[] };
    try {
      const currentStreak = await getUserStreak(userId);
      coinResult = await awardSwipeCoins(userId, effectiveCorrect, currentStreak);

      // Apply coin magnet bonus
      if (coinMultiplier > 1 && coinResult.coinsAwarded > 0) {
        const bonus = Math.round(coinResult.coinsAwarded * (coinMultiplier - 1));
        if (bonus > 0) {
          const { addCoins } = await import('@/lib/coinService');
          await addCoins(userId, bonus, 'Bonus: Magnet na mince');
          coinResult.coinsAwarded += bonus;
          coinResult.breakdown.push(`Magnet bonus: +${bonus}`);
        }
      }
    } catch (coinErr) {
      console.error('[API /swipe] Coin award error:', coinErr);
    }

    // Consume score boost uses
    await consumeSwipeEffects(userId);

    // Update weekly leaderboard
    try {
      const { getUserGameScore } = await import('@/lib/swipeScoreService');
      const score = await getUserGameScore(userId);
      if (score) {
        const total = score.positivePoints + score.negativePoints;
        await submitWeeklyScore(userId, displayName || score.displayName || 'Hráč', score.positivePoints, total);
      }
    } catch (weeklyErr) {
      console.error('[API /swipe] Weekly leaderboard error:', weeklyErr);
    }

    // Get updated effects summary for frontend
    const updatedEffects = await getActiveEffects(userId);

    return NextResponse.json({
      success: true,
      direction,
      pointsAdded: isCorrect || safetyNetUsed ? 'positive' : 'negative',
      coinsAwarded: coinResult.coinsAwarded,
      coinBreakdown: coinResult.breakdown,
      scoreMultiplier,
      safetyNetUsed,
      activeEffects: updatedEffects.map((e) => e.itemId),
    });

  } catch (error) {
    console.error('Error processing swipe:', error);
    return NextResponse.json(
      { error: 'Failed to process swipe', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
