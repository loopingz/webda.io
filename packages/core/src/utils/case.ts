/**
 * Transform the name of the model to be used in the URL
 *
 * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
 */
export type TransformCaseType =
  | "none"
  | "camelCase"
  | "ENV_VAR"
  | "snake_case"
  | "PascalCase"
  | "kebab-case"
  | "UPPERCASE"
  | "lowercase";

export function TransformCase(name: string, newCase: TransformCaseType) {
  if (newCase === "camelCase") {
    return name.substring(0, 1).toLowerCase() + name.substring(1).replace(/_(.)/g, (match, p1) => p1.toUpperCase());
  } else if (newCase === "lowercase") {
    return name.toLowerCase();
  } else if (newCase === "snake_case") {
    return (
      name[0].toLowerCase() +
      name
        .slice(1)
        .replace(/-/g, "_")
        .replace(/[^_]([A-Z])/g, l => {
          return `${l[0]}_${l[1].toLowerCase()}`;
        })
        .toLowerCase()
    );
  } else if (newCase === "ENV_VAR") {
    return (
      name[0].toUpperCase() +
      name
        .slice(1)
        .replace(/-/g, "_")
        .replace(/[^_]([A-Z])/g, l => {
          return `${l[0]}_${l[1].toUpperCase()}`;
        })
        .toUpperCase()
    );
  } else if (newCase === "PascalCase") {
    return name[0].toUpperCase() + name.slice(1).replace(/[-_][a-zA-Z0-9]/g, l => l[1].toUpperCase());
  } else if (newCase === "kebab-case") {
    return (
      name[0].toLowerCase() +
      name
        .slice(1)
        .replace(/_/g, "-")
        .replace(/[^-]([A-Z])/g, l => {
          return `${l[0]}-${l[1].toLowerCase()}`;
        })
        .toLowerCase()
    );
  }
  return name;
}
