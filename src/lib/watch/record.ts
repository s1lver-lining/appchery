import { listEnds, listShots, removeEndAt, replaceEnd } from '$lib/db/repository';
import { localEnd } from './apply';
import type { Record, Round } from './link';
import type { EndState } from './protocol';

/**
 * The session's view of the record, over the real database. Deliberately thin: every decision about
 * what an arriving end does was already made in apply.ts, where it is tested without a device.
 */
export function recordFor(round: Round): Record {
	const arrowsIn = (stageIndex: number) => round.stages[stageIndex]?.arrowsPerEnd ?? 0;

	return {
		async readEnd(stageIndex: number, endNo: number): Promise<EndState | null> {
			const arrowsPerEnd = arrowsIn(stageIndex);
			if (arrowsPerEnd === 0) return null;

			const end = (await listEnds(round.activityId)).find(
				(row) => row.stageIndex === stageIndex && row.endNo === endNo
			);
			if (!end) return null;

			const shots = await listShots(end.id);
			/**
			 * The end's own `updatedAt` and `deviceId` are what last write wins compares, so they come
			 * from the row rather than from now: an end written an hour ago must read as an hour old.
			 */
			return localEnd(stageIndex, endNo, shots, arrowsPerEnd, end.updatedAt, end.deviceId);
		},

		async writeEnd(stageIndex, endNo, shots) {
			await replaceEnd(round.activityId, stageIndex, endNo, shots);
		},

		async removeEnd(stageIndex, endNo) {
			await removeEndAt(round.activityId, stageIndex, endNo);
		}
	};
}
