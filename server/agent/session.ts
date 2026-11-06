import { Coordinator } from './coordinator/coordinator.js';
import type { WorkingMemorySnapshot } from './memory/types.js';
import type { StructuredInput } from './flows/types.js';
import type { EmitEvent } from './llm/runner-provider.js';
import { SessionTracer } from './tracer/tracer.js';
import type { GeoPoint } from './env/env-service.js';

export interface UserMessageInput {
  goalId?: string;
  type: 'text';
  text: string;
  geo?: GeoPoint;
}
export interface SelectActivityInput {
  type: 'select_activity';
  activityId: string;
  geo?: GeoPoint;
}
export interface SubmitTextInput {
  type: 'submit_text';
  text: string;
  geo?: GeoPoint;
  /** 这一步实际耗时（秒），由前端软计时器统计；缺省即不带节奏旁白 */
  elapsedSeconds?: number;
}
export interface SubmitPhotoInput {
  type: 'submit_photo';
  description: string;
  /** 现场照片的 data URL（data:image/...;base64,...），用于多模态验收 */
  imageDataUrl?: string;
  /** 现场照片的可访问 URL（/evidence/xxx.jpg），用于持久化到记录页 */
  photoUrl?: string;
  geo?: GeoPoint;
  /** 这一步实际耗时（秒），由前端软计时器统计；缺省即不带节奏旁白 */
  elapsedSeconds?: number;
}
export interface AbandonInput {
  type: 'abandon';
  geo?: GeoPoint;
}
export type UserInput =
  | UserMessageInput
  | SelectActivityInput
  | SubmitTextInput
  | SubmitPhotoInput
  | AbandonInput;

function toStructuredInput(input: UserInput): StructuredInput {
  switch (input.type) {
    case 'text':
      return { kind: 'text', text: input.text, geo: input.geo, goalId: input.goalId };
    case 'select_activity':
      return { kind: 'select_activity', activityId: input.activityId, geo: input.geo };
    case 'submit_text':
      return { kind: 'submit_text', text: input.text, geo: input.geo, elapsedSeconds: input.elapsedSeconds };
    case 'submit_photo':
      return { kind: 'submit_photo', description: input.description, imageDataUrl: input.imageDataUrl, photoUrl: input.photoUrl, geo: input.geo, elapsedSeconds: input.elapsedSeconds };
    case 'abandon':
      return { kind: 'abandon', geo: input.geo };
  }
}

export class AgentSession {
  id: string;
  clientId: string;
  private coordinator: Coordinator;
  private tracer: SessionTracer;

  constructor(id: string, clientId: string, snapshot?: WorkingMemorySnapshot) {
    this.id = id;
    this.clientId = clientId;
    this.tracer = new SessionTracer(id);
    this.coordinator = new Coordinator(id, clientId, this.tracer, snapshot);
  }

  get ctx(): WorkingMemorySnapshot {
    return this.coordinator.snapshot();
  }

  async processInput(input: UserInput, emit: EmitEvent): Promise<void> {
    const structured = toStructuredInput(input);
    const tracedEmit = this.tracer.wrapEmit(emit);
    await this.coordinator.process(structured, tracedEmit);
  }
}
