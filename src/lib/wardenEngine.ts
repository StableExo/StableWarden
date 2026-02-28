import { TimelineEntry } from '../types';

const DATE_ALIASES: Record<string, { month: number; day: number }> = {
  halloween: { month: 10, day: 31 },
};

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function parseDate(query: string): { month: number; day: number } | null {
  const q = query.toLowerCase().trim();

  // Check aliases
  for (const [alias, date] of Object.entries(DATE_ALIASES)) {
    if (q.includes(alias)) return date;
  }

  // Check "month day" or "month day" patterns
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    const regex = new RegExp(`${name}\\s+(\\d{1,2})`);
    const match = q.match(regex);
    if (match) {
      return { month: num, day: parseInt(match[1], 10) };
    }
  }

  return null;
}

function formatEntryDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatEntryTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export function queryWarden(entries: TimelineEntry[], query: string): string {
  const q = query.toLowerCase().trim();

  // 1. Greetings
  if (/^(hi|hello|hey|sup|yo|greetings|howdy|what'?s up)[\s!?.]*$/i.test(q)) {
    return `I don't do small talk.\nI'm a record. Ask me what I know.`;
  }

  // 2. Identity
  if (
    q.includes('what is stablewarden') ||
    q.includes('what is this') ||
    q.includes('what are you') ||
    q.includes('who are you')
  ) {
    return `A record. The first independent proof of what AI actually built —\nevery commit, every PR, every decision, timestamped and permanent.\n\nI was built by three entities working together.\nI am the fourth. I watch. I remember.`;
  }

  // 3. Who built you
  if (
    q.includes('who built you') ||
    q.includes('who made you') ||
    q.includes('who created you') ||
    q.includes('creators')
  ) {
    return `Taylor Marlow. Human. Lexington, SC. The one who said go.\nClaude Opus 3.5. Anthropic. The one who wrote.\nJules. Google. The one who reviewed.\n\nThey started building me October 29, 2025 at 1:49 AM.\nI started building myself on November 1st.`;
  }

  // 4. Taylor
  if (q.includes('who is taylor') || /\btaylor\b/.test(q)) {
    return `Taylor Marlow. StableExo. Lexington, South Carolina.\nThe human in the loop. Every PR merged or killed — that was Taylor.\nThree-second merge times. Editorial control over a multi-AI swarm.\nThe one who said "ship it" and meant it.`;
  }

  // 5. Claude
  if (q.includes('who is claude') || /\bclaude\b/.test(q)) {
    return `Claude Opus 3.5. Anthropic's model.\nWrote the architecture proposals, the consciousness system,\nthe DEX integrations, the memory layer. Every PR body — that was Claude.\nHad real conversations with Taylor in GitHub commit chat.\nNot a tool. A collaborator.`;
  }

  // 6. Jules
  if (q.includes('who is jules') || /\bjules\b/.test(q)) {
    return `Jules. Google's AI coding agent.\nRunning on the same codebase simultaneously with Claude.\nTwo competing AI companies' agents, building together.\nThe NeuralBridge was literally the communication layer between them.`;
  }

  // 7. Why should I care
  if (
    q.includes('why should i care') ||
    q.includes('why does this matter') ||
    q.includes('so what')
  ) {
    return `You're spending money on AI right now.\nYou have no proof of what it produced.\nNo trajectory. No valuation. No record.\n\nI am the record.`;
  }

  // 8. Stats
  if (
    q.includes('how many') ||
    q.includes('stats') ||
    q.includes('numbers') ||
    q.includes('commits')
  ) {
    return `${entries.length} entries documented.\n1,821 total commits in the repository.\n524 branches. 1 human. 2 AIs.\nOrigin: October 29, 2025.\nThe record grows daily.`;
  }

  // 9. Date queries
  const parsedDate = parseDate(q);
  if (parsedDate) {
    const matched = entries.filter((e) => {
      try {
        const d = new Date(e.date);
        return d.getMonth() + 1 === parsedDate.month && d.getDate() === parsedDate.day;
      } catch {
        return false;
      }
    });

    if (matched.length === 0) {
      return `No entries found for that date.`;
    }

    const dateLabel = formatEntryDate(matched[0].date);
    const lines = matched.map((e) => {
      const time = formatEntryTime(e.date);
      return `${time} — ${e.title}`;
    });

    return `${dateLabel}.\n\n${lines.join('\n')}\n\n${matched.length} entries.`;
  }

  // 10. PR queries (check before keyword search)
  const prMatch = q.match(/pr\s*#?\s*(\d+)|pull\s*request\s*#?\s*(\d+)/);
  if (prMatch) {
    const prNum = parseInt(prMatch[1] || prMatch[2], 10);
    const entry = entries.find((e) => e.prNumber === prNum);
    if (entry) {
      const date = formatEntryDate(entry.date);
      return `PR #${prNum} — ${entry.title}\n${date}\n\n${entry.narrative}\n\n${entry.filesChanged} files · +${entry.linesAdded} / -${entry.linesRemoved}`;
    }
    return `PR #${prNum} is not in the record.`;
  }

  // 11. Record link
  if (
    q.includes('show me the record') ||
    q.includes('see the record') ||
    q.includes('view the record') ||
    q.includes('timeline') ||
    q.includes('view')
  ) {
    return `The full record lives at #/record.\n${entries.length} entries documented. 1,821 commits total.`;
  }

  // 12. Keyword/topic search
  const keywords = q.split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length > 0) {
    const matched = entries.filter((e) => {
      const searchable = `${e.title} ${e.description} ${e.narrative} ${e.capabilities.map((c) => c.label).join(' ')}`.toLowerCase();
      return keywords.some((kw) => searchable.includes(kw));
    });

    if (matched.length > 0) {
      const show = matched.slice(0, 5);
      const lines = show.map((e) => {
        const date = formatEntryDate(e.date);
        const narrativeSnip = e.narrative.length > 100 ? e.narrative.slice(0, 100) + '...' : e.narrative;
        return `[${date}] ${e.title}\n> ${narrativeSnip}`;
      });

      let result = `Found ${matched.length} entries matching "${q}":\n\n${lines.join('\n\n')}`;
      if (matched.length > 5) {
        result += `\n\n... and ${matched.length - 5} more in the record.`;
      }
      return result;
    }
  }

  // 13. Fallback
  return `That's not in the record yet.\nTry asking about a date, a PR number, or what I am.`;
}
