declare module 'diff' {
  export interface StructuredPatchHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }

  export interface StructuredPatch {
    oldFileName: string;
    newFileName: string;
    hunks: StructuredPatchHunk[];
  }

  export function structuredPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number },
  ): StructuredPatch;
}
