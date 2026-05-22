import { generateForwardComment } from "../generator.js";
import type { CommentGenerator } from "./interfaces.js";

export class QwenCliCommentGenerator implements CommentGenerator {
  async generate(postText: string, systemPrompt?: string): Promise<string> {
    return generateForwardComment(postText, systemPrompt);
  }
}
