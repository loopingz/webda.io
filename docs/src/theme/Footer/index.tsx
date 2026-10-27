import type FooterType from "@theme/Footer";
import type { WrapperProps } from "@docusaurus/types";

type Props = WrapperProps<typeof FooterType>;

/**
 * The site has no footer: the page ends with its content.
 *
 * @param props - original footer props, unused
 * @returns nothing
 */
export default function FooterWrapper(props: Props): JSX.Element | null {
  return null;
}
