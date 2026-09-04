import * as vscode from "vscode";
import { isRatingPromptEnabled } from "./sqlUtils";

const STORAGE_KEY = "sqlStudio.reviewPrompt";

const REVIEW_URL =
  "https://marketplace.visualstudio.com/items?itemName=LevRagulin.cursor-sql-studio&ssr=false#review-details";

/** Successful queries before the first ask. */
const QUERIES_BEFORE_PROMPT = 25;
/** Days the extension must have been in use before the first ask. */
const DAYS_BEFORE_PROMPT = 7;
/** Days before someone who chose "Later" is asked again. */
const DAYS_BETWEEN_PROMPTS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Local-only usage counters behind the rating prompt. Nothing here leaves the
 * machine: the numbers decide when to show the toast and are never reported.
 */
export interface ReviewPromptState {
  successfulQueries: number;
  firstSeenAt: number;
  lastPromptedAt?: number;
  /** Set once the user rated or asked not to be asked again. */
  dismissed?: boolean;
}

/**
 * Pure decision so the thresholds stay testable without a vscode host: ask only
 * after enough successful queries, once the extension has been around for a
 * while, and never more than once per DAYS_BETWEEN_PROMPTS.
 */
export function shouldPrompt(state: ReviewPromptState, now: number): boolean {
  if (state.dismissed) {
    return false;
  }
  if (state.successfulQueries < QUERIES_BEFORE_PROMPT) {
    return false;
  }
  if (now - state.firstSeenAt < DAYS_BEFORE_PROMPT * DAY_MS) {
    return false;
  }
  if (
    state.lastPromptedAt !== undefined &&
    now - state.lastPromptedAt < DAYS_BETWEEN_PROMPTS * DAY_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Occasional "rate SQL Studio" toast, shown after a successful query so the ask
 * lands on a moment the extension just did something useful. State lives in
 * globalState; the `sqlStudio.showRatingPrompt` setting turns it off entirely.
 */
export class ReviewPrompt {
  private prompting = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private read(): ReviewPromptState {
    const raw = this.context.globalState.get<ReviewPromptState>(STORAGE_KEY);
    if (!raw || typeof raw !== "object" || typeof raw.firstSeenAt !== "number") {
      return { successfulQueries: 0, firstSeenAt: Date.now() };
    }
    return {
      ...raw,
      successfulQueries:
        typeof raw.successfulQueries === "number" ? raw.successfulQueries : 0,
    };
  }

  private async write(state: ReviewPromptState): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, state);
  }

  /**
   * Record first use, so the "days since first use" gate measures installation
   * age rather than the age of the first successful query. Runs even when the
   * prompt is disabled: turning the setting on later must not restart the clock.
   */
  async initialize(): Promise<void> {
    try {
      if (this.context.globalState.get<ReviewPromptState>(STORAGE_KEY)) {
        return;
      }
      await this.write({ successfulQueries: 0, firstSeenAt: Date.now() });
    } catch {
      // A missing seed only delays the first ask; never fail activation for it.
    }
  }

  /**
   * Count one successful query and, when the thresholds are met, ask for a
   * review. Never rejects — a broken counter must not surface on the query path.
   */
  async recordSuccessfulQuery(): Promise<void> {
    try {
      if (!isRatingPromptEnabled()) {
        return;
      }
      const state = this.read();
      state.successfulQueries += 1;
      await this.write(state);

      if (this.prompting || !shouldPrompt(state, Date.now())) {
        return;
      }
      this.prompting = true;
      try {
        await this.ask(state);
      } finally {
        this.prompting = false;
      }
    } catch {
      // Counting usage is never worth interrupting a query for.
    }
  }

  private async ask(state: ReviewPromptState): Promise<void> {
    const rate = "Rate SQL Studio";
    const later = "Later";
    const never = "Don't ask again";
    const picked = await vscode.window.showInformationMessage(
      "Enjoying SQL Studio? A rating on the Marketplace helps a lot.",
      rate,
      later,
      never
    );

    const next: ReviewPromptState = { ...state, lastPromptedAt: Date.now() };
    if (picked === rate) {
      next.dismissed = true;
      await vscode.env.openExternal(vscode.Uri.parse(REVIEW_URL));
    } else if (picked === never) {
      next.dismissed = true;
    }
    // "Later" and a dismissed toast both fall through: the timestamp above is
    // what delays the next ask.
    await this.write(next);
  }
}
