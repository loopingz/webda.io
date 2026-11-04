/* eslint-disable jsdoc/require-jsdoc */
import { Column, Row, Section, Text } from "@react-email/components";
import DefaultLayout from "../layouts";

interface EventConfirmationProps {
  firstName?: string;
  eventName?: string;
  eventLocation?: string;
  eventDate?: string;
  eventTime?: string;
  numberOfChildren?: string;
}

export default function EventConfirmation({
  firstName,
  eventName,
  eventLocation,
  eventDate,
  eventTime,
  numberOfChildren
}: EventConfirmationProps) {
  return (
    <DefaultLayout
      title={EventConfirmation.Subject}
      upperSectionContent={
        <>
          <Text style={mainText}>Hi {firstName},</Text>
          <Text style={mainText}>
            You're all set! Your registration for <strong>{eventName}</strong> has been confirmed. We can't wait to see
            you there.
          </Text>
        </>
      }
    >
      <Section style={lowerSection}>
        <Section style={infoPanel}>
          <Row style={infoRow}>
            <Column style={infoItem}>
              <Text style={infoIcon}>📍</Text>
            </Column>
            <Column>
              <Text style={infoLabel}>Location</Text>
              <Text style={infoValue}>{eventLocation}</Text>
            </Column>
          </Row>
          <Row style={infoRow}>
            <Column style={infoItem}>
              <Text style={infoIcon}>📅</Text>
            </Column>
            <Column>
              <Text style={infoLabel}>Date</Text>
              <Text style={infoValue}>{eventDate}</Text>
            </Column>
          </Row>
          <Row style={infoRow}>
            <Column style={infoItem}>
              <Text style={infoIcon}>🕐</Text>
            </Column>
            <Column>
              <Text style={infoLabel}>Time</Text>
              <Text style={infoValue}>{eventTime}</Text>
            </Column>
          </Row>
          <Row style={infoRow}>
            <Column style={infoItem}>
              <Text style={infoIcon}>👶</Text>
            </Column>
            <Column>
              <Text style={infoLabel}>Children registered</Text>
              <Text style={infoValue}>{numberOfChildren}</Text>
            </Column>
          </Row>
        </Section>
        <Text style={footNote}>If you have any questions, feel free to reply to this email. See you soon!</Text>
      </Section>
    </DefaultLayout>
  );
}

EventConfirmation.PreviewProps = {
  firstName: "Marie",
  eventName: "Example Playdate",
  eventLocation: "Example Cafe, Springfield",
  eventDate: "March 25th, 2026",
  eventTime: "10:00 AM - 10:30 AM",
  numberOfChildren: "2"
} satisfies EventConfirmationProps;

EventConfirmation.Subject = "You're registered! See you at the event";

const text = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  margin: "24px 0"
};

const lowerSection = { padding: "25px 35px" };

const mainText = { ...text, marginBottom: "14px" };

const footNote = { ...text, fontSize: "13px", color: "#666" };

const infoPanel = {
  backgroundColor: "#000091",
  borderRadius: "12px",
  padding: "16px 24px",
  margin: "0 0 16px 0"
};

const infoRow = {
  marginBottom: "8px"
};

const infoItem = {
  width: "40px",
  verticalAlign: "top" as const
};

const infoIcon = {
  fontSize: "20px",
  margin: "0",
  lineHeight: "1"
};

const infoLabel = {
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.7)",
  margin: "0",
  fontFamily: text.fontFamily
};

const infoValue = {
  fontWeight: "600" as const,
  fontSize: "15px",
  color: "#fff",
  margin: "2px 0 8px 0",
  fontFamily: text.fontFamily
};
