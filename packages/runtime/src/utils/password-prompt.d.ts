declare module "password-prompt" {
  /**
   * Prompt the user for a password on the terminal
   * @param ask - prompt displayed to the user
   * @param options - prompt options
   * @param options.method - "hide" to hide the input, "mask" to display "*" characters
   * @param options.required - re-ask until a non-empty answer is given
   * @param options.default - default value when the answer is empty
   * @returns the entered password
   */
  export default function prompt(
    ask: string,
    options?: { method?: "hide" | "mask"; required?: boolean; default?: string }
  ): Promise<string>;
}
