/* eslint-disable jsdoc/require-jsdoc */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Button as LibButton,
} from "@react-email/components";
import React from "react";

export function Button({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <LibButton href={href} style={{ ...style, backgroundColor: "#000091", color: "#fff", padding: "12px 20px", borderRadius: "4px", textDecoration: "none", display: "inline-block" }}>
      {children}
    </LibButton>
  );
}

export default function DefaultLayout({
  title,
  children,
  upperSectionContent,
}: {
  title: string;
  children: React.ReactNode;
  upperSectionContent?: React.ReactNode | string;
}) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Preview>{title}</Preview>
        <Container style={container}>
          <Section style={outerFrame}>
            <Section style={innerFrame}>
              <Section style={coverSection}>
                <Section style={imageSection}>
                  <Img
                    src={`https://example.com/logo.png`}
                    width="120"
                    height="120"
                    alt="Example Logo"
                    style={{ marginLeft: "20px" }}
                  />
                </Section>
                <Section style={upperSection}>
                  <Heading style={h1}>{title}</Heading>
                  {upperSectionContent}
                </Section>
                <Hr />
                {children}
              </Section>
            </Section>
          </Section>
          <Text style={footerText}>
            This message was produced and distributed by Example Club.
            If you have any questions, please contact us at{" "}
            <Link href="mailto:contact@example.com" style={link}>
              contact@example.com
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#fff",
  color: "#212121",
};

const container = {
  padding: "20px",
  margin: "0 auto",
  backgroundColor: "#eee",
  maxWidth: "1280px",
};

const h1 = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "20px",
  fontWeight: "bold",
  marginBottom: "15px",
};

const outerFrame = {
  border: "4px solid #000091",
  padding: "10px",
  backgroundColor: "#fff",
};

const innerFrame = {
  border: "4px solid #E20010",
  padding: "0",
  backgroundColor: "#fff",
};

const imageSection = {
  backgroundColor: "#fff",
  display: "flex",
  padding: "20px",
  alignItems: "center",
  justifyContent: "center",
};

const coverSection = { backgroundColor: "#fff" };

const upperSection = { padding: "25px 35px" };

const lowerSection = { padding: "25px 35px" };

const link = {
  color: "#2754C5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  textDecoration: "underline",
};

const text = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  margin: "24px 0",
};

const footerText = {
  ...text,
  fontSize: "12px",
  padding: "0 20px",
};
