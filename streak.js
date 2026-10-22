
import {
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase-config.js";

// Get today's date in Kenya
function getKenyaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const date = {};
  parts.forEach(part => date[part.type] = part.value);

  return `${date.year}-${date.month}-${date.day}`;
}

// Convert a date into a number for comparing days
function dayNumber(date) {
  return Math.floor(
    Date.parse(date + "T00:00:00Z") / 86400000
  );
}

// Record a daily check-in for a signed-in user
export async function checkIn(user) {
  if (!user) {
    throw new Error("Please sign in first.");
  }

  const today = getKenyaDate();
  const userRef = doc(db, "users", user.uid);

  return await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(userRef);
    const data = snapshot.exists() ? snapshot.data() : {};

    let currentStreak = Number(data.currentStreak || 0);
    let bestStreak = Number(data.bestStreak || 0);
    const lastCheckIn = data.lastCheckIn || "";

    // Only count one check-in per day
    if (lastCheckIn === today) {
      return {
        currentStreak,
        bestStreak,
        alreadyCheckedIn: true
      };
    }

    // Continue the streak if the previous check-in was yesterday
    if (
      lastCheckIn &&
      dayNumber(today) - dayNumber(lastCheckIn) === 1
    ) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }

    bestStreak = Math.max(bestStreak, currentStreak);

    transaction.set(userRef, {
      displayName: user.displayName || "",
      currentStreak,
      bestStreak,
      lastCheckIn: today,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return {
      currentStreak,
      bestStreak,
      alreadyCheckedIn: false
    };
  });
}
