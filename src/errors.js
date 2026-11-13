export class EmberError extends Error {
  constructor(stage, message, point) {
    super(message);
    this.name = "EmberError";
    this.stage = stage;
    this.point = point && { line: point.line, column: point.column };
  }
  format(source, filename = "<input>") {
    const prefix = this.point
      ? filename + ":" + this.point.line + ":" + this.point.column
      : filename;
    const lines = [prefix + ": " + this.stage + ": " + this.message];
    if (this.point && source !== undefined) {
      const line = source.split(/\r?\n/)[this.point.line - 1];
      if (line !== undefined)
        lines.push(
          line,
          " ".repeat(Math.min(this.point.column - 1, line.length)) + "^",
        );
    }
    if (this.frames?.length) lines.push("  in " + this.frames.join(" <- "));
    return lines.join("\n");
  }
}

export function fault(stage, message, point) {
  throw new EmberError(stage, message, point);
}
