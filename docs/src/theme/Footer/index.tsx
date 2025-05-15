import React from "react";
import type FooterType from "@theme/Footer";
import type { WrapperProps } from "@docusaurus/types";

type Props = WrapperProps<typeof FooterType>;

export default function FooterWrapper(props: Props): JSX.Element {
  return (
    <>
      <div style={{ backgroundColor: "#afcedb", height: 48 }}></div>
    </>
  );
}
