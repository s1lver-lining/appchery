import {
	getActivity,
	getSession,
	listEnds,
	listSessions,
	listShots,
	listWristMotion
} from '$lib/db/repository';

/**
 * Every recorded end, beside what was scored in it, as one file to analyse elsewhere. Samples stay
 * deflated as the watch wrote them; `scripts/wrist-motion.mjs` decodes a file into CSV.
 */
export async function exportWristMotion(): Promise<Blob> {
	const rows = await listWristMotion();
	const activities = new Map<string, Awaited<ReturnType<typeof describe>>>();
	const recordings = [];
	// Newest first, so the first that began before a training recording is the one it was shot in.
	const sessions = (await listSessions()).slice().sort((a, b) => b.startedAt - a.startedAt);
	for (const row of rows) {
		if (row.activityId === 'training') {
			const session = sessions.find((s) => s.startedAt <= row.startedAt);
			recordings.push({
				kind: 'training',
				sessionId: session?.id ?? null,
				session: session?.label ?? null,
				arm: row.arm,
				startedAt: row.startedAt,
				durationMs: row.durationMs,
				arrowsBefore: row.arrowsBefore,
				arrowsAfter: row.arrowsAfter,
				countedBy: row.countedBy,
				data: row.data
			});
			continue;
		}
		if (!activities.has(row.activityId)) activities.set(row.activityId, await describe(row.activityId));
		const activity = activities.get(row.activityId)!;
		const end = activity.ends.get(`${row.stageIndex}:${row.endNo}`);
		recordings.push({
			kind: 'end',
			activityId: row.activityId,
			stageIndex: row.stageIndex,
			endNo: row.endNo,
			arm: row.arm,
			startedAt: row.startedAt,
			durationMs: row.durationMs,
			shotOrdinal: row.shotOrdinal,
			endedOnShot: row.endedOnShot,
			arrows: end?.arrows ?? null,
			score: end?.score ?? null,
			data: row.data
		});
	}
	const file = {
		format: 'appchery-wrist-motion',
		version: 1,
		exportedAt: Date.now(),
		activities: [...activities].map(([id, activity]) => ({ id, ...activity.summary })),
		recordings
	};
	return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

async function describe(activityId: string) {
	const activity = await getActivity(activityId);
	const session = activity ? await getSession(activity.sessionId) : null;
	const ends = new Map<string, { arrows: string[]; score: number }>();
	for (const end of activity ? await listEnds(activityId) : []) {
		const shots = (await listShots(end.id)).filter((shot) => shot.side === 'us');
		ends.set(`${end.stageIndex}:${end.endNo}`, {
			arrows: shots.map((shot) => shot.zoneLabel),
			score: shots.reduce((sum, shot) => sum + shot.value, 0)
		});
	}
	let round: string | null = null;
	try {
		round = activity?.roundDefinition ? JSON.parse(activity.roundDefinition).name ?? null : null;
	} catch {
		// A snapshot that does not parse still leaves the recording worth having.
	}
	return {
		summary: {
			round,
			startedAt: activity?.startedAt ?? null,
			session: session?.label ?? null,
			bowType: session?.bowType ?? null
		},
		ends
	};
}
