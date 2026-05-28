import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { createEditToolDefinition } from "@earendil-works/pi-coding-agent";

export const editTool = (cwd: string) =>
  tool({
    ...createEditToolDefinition(cwd),
    promptSnippet: "精确替换文件内容，支持单文件多处非重叠编辑",
    promptGuidelines: [
      "edit 用于精确修改（edits[].oldText 必须完全匹配）",
      "修改同一文件多处时，用一次 edit 调用携带多个 edits[]，而非多次 edit 调用",
      "每个 edits[].oldText 基于原始文件匹配，而非前面的 edit 生效后。不要产生重叠或嵌套的编辑。邻近改动合并为一次 edit",
      "edits[].oldText 尽量简短但保持在文件中唯一。不要用大段未改动的内容来凑匹配",
    ],
    description: `
精确替换文件内容。edits[].oldText 必须与原始文件中一段唯一、不重叠的文本完全匹配。
如果两次改动涉及同一块或相邻行，合并为一次 edit。不要混入大段未改动的上下文。每处 edit 基于原始文件匹配，非增量式。
`.trim(),
    parameters: Type.Object({
      path: Type.String({ description: "文件路径（相对或绝对）" }),
      edits: Type.Array(
        Type.Object(
          {
            oldText: Type.String({
              description:
                "要精确替换的一段文本，必须在原始文件中唯一匹配。同一调用中的多个 edits[].oldText 不能重叠",
            }),
            newText: Type.String({ description: "替换后的文本" }),
          },
          { additionalProperties: false },
        ),
        {
          description:
            "一次或多次精确替换，每次基于原始文件匹配。如果改动邻近或重叠，合并为一次",
        },
      ),
    }),
  });
