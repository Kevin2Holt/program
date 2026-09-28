/*
	Overlap detection for timed selections. Two selections conflict only when
	they are on the same date and their time ranges intersect; touching ranges
	(one ends exactly when the other starts) don't. Date-only selections never
	conflict.
*/
import { convertTimeToMinutes } from "../times.js";


export function checkRangesOverlap(startA, endA, startB, endB) {

	return startA < endB && startB < endA;
}

function toRange(selection) {

	const start = convertTimeToMinutes(selection.startTime);
	return { start, end: start + selection.durationMinutes };
}

export function checkSelectionsOverlap(a, b) {

	if (!a.startTime || !b.startTime || a.date !== b.date) {
		return false;
	}
	const rangeA = toRange(a);
	const rangeB = toRange(b);
	return checkRangesOverlap(rangeA.start, rangeA.end, rangeB.start, rangeB.end);
}

// Returns every overlapping pair as [indexA, indexB].
export function findOverlappingPairs(selections) {

	const pairs = [];
	for (let a = 0; a < selections.length; a += 1) {
		for (let b = a + 1; b < selections.length; b += 1) {
			if (checkSelectionsOverlap(selections[a], selections[b])) {
				pairs.push([a, b]);
			}
		}
	}
	return pairs;
}

// The first selection that `candidate` would overlap, or null.
export function findOverlapWith(candidate, selections) {

	return selections.find((selection) => checkSelectionsOverlap(candidate, selection)) || null;
}
