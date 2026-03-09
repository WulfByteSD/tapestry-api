/**
 * Character biographical and descriptive information.
 * Note: This type has no corresponding Mongoose schema as it's embedded directly.
 */
export type CharacterProfile = {
  title?: string;
  bio?: string;
  race?: string;
  nationality?: string;
  religion?: string;
  sex?: string;
  height?: string;
  weight?: string;
  eyes?: string;
  hair?: string;
  ethnicity?: string;
  age?: number | string;
  extra?: Record<string, string>;
};
