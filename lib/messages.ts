export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image"; attachmentId: string };
export type VideoPart = { type: "video"; attachmentId: string };
export type MessagePart = TextPart | ImagePart | VideoPart;

export function textFromParts(parts: MessagePart[]) {
  return parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
