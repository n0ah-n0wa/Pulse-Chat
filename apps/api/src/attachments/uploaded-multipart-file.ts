/** Minimal upload payload shape provided by NestJS multipart handling. */
export interface UploadedMultipartFile {
  readonly buffer: Buffer;
  readonly originalname: string;
}
