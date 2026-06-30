import type { Program, TrainingProfile } from "@pulsia/shared";

export interface AiClient {
  generateProgram(input: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
  }): Promise<Program>;
}
