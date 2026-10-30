import { describe, expect, it } from "bun:test";
import { SerializedWriter } from "./serialized-writer.ts";

interface DeferredResult {
	promise: Promise<void>;
	release: () => void;
}

function deferred(): DeferredResult {
	let release: () => void = () => undefined;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("SerializedWriter", () => {
	it("coalesces concurrent callers and follows a slow write with the latest revision", async () => {
		const writer = new SerializedWriter<string>();
		const firstWrite = deferred();
		const values: string[] = [];
		let draft = "first";
		let calls = 0;
		const writeLatest = async () => {
			calls += 1;
			const captured = draft;
			if (calls === 1) {
				await firstWrite.promise;
			}
			values.push(captured);
			return captured;
		};

		writer.markChanged();
		const initialFlush = writer.flush(writeLatest);
		draft = "latest";
		writer.markChanged();
		const concurrentFlush = writer.flush(writeLatest);
		expect(concurrentFlush).toBe(initialFlush);
		firstWrite.release();

		expect(await initialFlush).toBe("latest");
		expect(values).toEqual(["first", "latest"]);
	});

	it("releases a failed write so an explicit retry can persist the same revision", async () => {
		const writer = new SerializedWriter<string>();
		writer.markChanged();
		await expect(
			writer.flush(() => Promise.reject(new Error("write refused")))
		).rejects.toThrow("write refused");
		expect(await writer.flush(() => Promise.resolve("saved"))).toBe("saved");
	});
});
