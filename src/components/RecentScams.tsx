import { AlertCircle, Phone, Mail, CreditCard } from "lucide-react";

const scams = [
  {
    Icon: Phone,
    title: "CRA Arrest Threat Calls",
    date: "Active across Canada",
    body: "Robocalls claiming you owe taxes and police are on the way. The CRA never threatens arrest or demands payment by gift cards or e-transfer.",
  },
  {
    Icon: Mail,
    title: "Canada Post 'Missed Delivery' Texts",
    date: "Widespread in BC & ON",
    body: "Text messages with a link asking for a small redelivery fee. The link steals credit card details. Canada Post never texts payment links.",
  },
  {
    Icon: CreditCard,
    title: "Grandparent Emergency Scam",
    date: "Rising in 2025",
    body: "A caller pretends to be a grandchild in jail needing bail money. They beg you not to tell the parents. Always hang up and call your family directly.",
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
