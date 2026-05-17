import { AlertCircle, MessageSquare, Mail, QrCode, Phone, Video, FileText, Car, Bitcoin } from "lucide-react";

const scams = [
  {
    Icon: MessageSquare,
    title: "RCMP 'Court Delivery' Text",
    date: "RCMP Warning · Jan 2025",
    body: "Text says RCMP couldn't deliver court documents and you must click a link to reschedule. The RCMP never sends texts. Don't click — delete and report.",
  },
  {
    Icon: Mail,
    title: "RCMP 'Summons' Email with PDF",
    date: "Saskatchewan RCMP · Feb 2026",
    body: "Email with an RCMP crest claims 'unacceptable activity' on your network and attaches a PDF summons. The sender domain is fake. Don't open the attachment.",
  },
  {
    Icon: FileText,
    title: "RCMP 'Sexual Offences' Extortion Email",
    date: "RCMP Newfoundland · Jan 2026",
    body: "Email signed by a fake 'RCMP Commissioner' threatens an arrest warrant for sexual offences to scare you into paying. It is not real. Don't respond — call your local police.",
  },
  {
    Icon: Video,
    title: "Fake Police Video Call Scam",
    date: "Manitoba RCMP · Feb 2026",
    body: "A text or email invites you to a video call with a 'police officer' who demands gift cards or Bitcoin. Real police never hold video calls or ask for crypto.",
  },
  {
    Icon: Car,
    title: "Parking Ticket Text Scam",
    date: "Vancouver, West Van, Saskatoon · 2025–2026",
    body: "Text demands immediate payment for an unpaid parking ticket via a link. Cities do not send parking notices by SMS. Check your city's website directly.",
  },
  {
    Icon: Mail,
    title: "Fake 'Fine Collection Branch' Email",
    date: "Saskatchewan RCMP · Feb 2026",
    body: "Email pretends to be from a provincial fine collection office with a fake payment link. Always verify by calling the number on the official government website.",
  },
  {
    Icon: QrCode,
    title: "Fake Parking Meter QR Codes",
    date: "Vancouver, Whistler, Penticton · Late 2025",
    body: "Fraudulent QR stickers placed over real ones on parking meters lead to fake payment sites that steal credit card info. Use the official parking app instead of scanning.",
  },
  {
    Icon: Mail,
    title: "CRA GST/HST Refund Phishing",
    date: "Active Canada-wide",
    body: "Email or text offers a tax refund and asks you to 'complete an application' via a link. The CRA never sends refund links by email or text. Log in at canada.ca directly.",
  },
  {
    Icon: Bitcoin,
    title: "CRA/RCMP Crypto Warrant Scam",
    date: "Active Canada-wide",
    body: "Caller claims you have an arrest warrant and must send Bitcoin to 'cancel' it, promising a refund later. The CRA never demands crypto. Hang up immediately.",
  },
];

export function RecentScams() {
  return (
    <section className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <AlertCircle className="h-7 w-7 text-gold" />
        <h2 className="text-2xl md:text-3xl font-semibold text-navy">Recent Scams in Canada</h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {scams.map(({ Icon, title, date, body }) => (
          <article
            key={title}
            className="rounded-2xl bg-card border border-border p-6 shadow-[var(--shadow-card)] hover:-translate-y-1 transition"
          >
            <div className="h-12 w-12 rounded-full bg-navy text-gold flex items-center justify-center mb-4">
              <Icon className="h-6 w-6" />
            </div>
            <p className="text-sm text-gold font-semibold uppercase tracking-wider mb-1">{date}</p>
            <h3 className="text-xl font-semibold text-navy mb-2">{title}</h3>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
