/** Coalesces edits while ensuring writes reach the host in invocation order. */
export class SerializedWriter<Result> {
	private active: Promise<Result> | null = null;
	private revision = 0;
	private savedRevision = 0;

	markChanged(): void {
		this.revision += 1;
	}

	flush(writeLatest: () => Promise<Result>): Promise<Result> {
		if (this.active) {
			return this.active;
		}

		const run = async (): Promise<Result> => {
			let result: Result;
			do {
				const writingRevision = this.revision;
				result = await writeLatest();
				this.savedRevision = writingRevision;
			} while (this.savedRevision < this.revision);
			return result;
		};
		this.active = run().finally(() => {
			this.active = null;
		});
		return this.active;
	}
}
