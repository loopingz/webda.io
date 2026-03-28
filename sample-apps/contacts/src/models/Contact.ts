import { CoreModel } from "@webda/core";

export interface ContactDTO {
  firstName: string;
  lastName: string;
  /**
   * @format date-time
   */
  dateOfBirth: string;
  email: string;
  phone: string;
}

/**
 * Contact Model
 */
export class Contact extends CoreModel {
  get displayName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  fromDto(dto: ContactDTO): this {
    this.firstName = dto.firstName;
    this.lastName = dto.lastName;
    this.dateOfBirth = new Date(dto.dateOfBirth);
    this.email = dto.email;
    this.phone = dto.phone;
    return this;
  }

  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  /**
   * @format email
   */
  email: string;
  /**
   * @format phone
   */
  phone: string;
}
