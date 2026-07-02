export class PhotoValidationError extends Error {}

type ImageDimensions = {
  width: number;
  height: number;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngDimensions(input: Buffer): ImageDimensions {
  if (input.length < 24 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PhotoValidationError("Uploaded PNG file is invalid.");
  }
  return {
    width: input.readUInt32BE(16),
    height: input.readUInt32BE(20),
  };
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(input: Buffer): ImageDimensions {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new PhotoValidationError("Uploaded JPEG file is invalid.");
  }

  let offset = 2;
  while (offset < input.length) {
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) break;

    const marker = input[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > input.length) break;

    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > input.length) {
      throw new PhotoValidationError("Uploaded JPEG file is invalid.");
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) throw new PhotoValidationError("Uploaded JPEG file is invalid.");
      return {
        height: input.readUInt16BE(offset + 3),
        width: input.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new PhotoValidationError("Could not read uploaded image dimensions.");
}

function readImageDimensions(input: Buffer, contentType: string): ImageDimensions {
  if (contentType === "image/png") return readPngDimensions(input);
  if (contentType === "image/jpeg") return readJpegDimensions(input);
  throw new PhotoValidationError("Photo must be a PNG or JPEG image.");
}

export async function validateCourtActorPhoto(photo: File): Promise<Buffer> {
  const contentType = photo.type.toLowerCase();
  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw new PhotoValidationError("Photo must be a PNG or JPEG image.");
  }

  const input = Buffer.from(await photo.arrayBuffer());
  const dimensions = readImageDimensions(input, contentType);
  if (
    dimensions.width < 200 ||
    dimensions.height < 200 ||
    dimensions.width > 5000 ||
    dimensions.height > 5000
  ) {
    throw new PhotoValidationError("Uploaded image dimensions are outside the allowed 200px to 5000px range.");
  }

  const aspectRatio = dimensions.width / dimensions.height;
  if (aspectRatio < 0.4 || aspectRatio > 1.6) {
    throw new PhotoValidationError("Uploaded image must be a headshot (portrait, square, or landscape), not a wide webpage screenshot. Crop closer to the face and try again.");
  }

  return input;
}
