
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-serif text-2xl font-bold text-navy-900 tracking-tight">
                CoHaven
              </span>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/features" className="text-sm font-medium hover:text-primary">
              Features
            </Link>
            <Link to="/pricing" className="text-sm font-medium hover:text-primary">
              Pricing
            </Link>
            <Link to="/support" className="text-sm font-medium hover:text-primary">
              Support
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/signin">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="bg-navy-900 hover:bg-navy-800">
                Sign up
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 md:py-32 bg-gradient-to-b from-navy-50 to-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <h1 className="font-serif text-4xl md:text-6xl font-bold text-navy-900 tracking-tight leading-tight">
                Simplify Co-Owned Property Management
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground">
                CoHaven is the elegant solution for managing shared properties, streamlining expenses, scheduling, and keeping co-owners aligned.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-navy-900 hover:bg-navy-800 w-full sm:w-auto">
                    Get Started
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Watch Demo
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-navy-900 mb-4">
                Everything You Need for Seamless Co-Ownership
              </h2>
              <p className="text-muted-foreground">
                CoHaven brings transparency and simplicity to shared property ownership with powerful yet intuitive features.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Expense Tracking",
                  description:
                    "Easily log, categorize, and split expenses among co-owners with flexible splitting options.",
                },
                {
                  title: "Booking Calendar",
                  description:
                    "Eliminate scheduling conflicts with our intuitive shared calendar system for property usage.",
                },
                {
                  title: "Document Storage",
                  description:
                    "Keep important documents organized and accessible to all authorized co-owners.",
                },
                {
                  title: "Maintenance Tracking",
                  description:
                    "Log and assign maintenance tasks to ensure your property stays in perfect condition.",
                },
                {
                  title: "Co-Owner Management",
                  description:
                    "Easily manage property shares, permissions, and communication with other owners.",
                },
                {
                  title: "Financial Reports",
                  description:
                    "Generate detailed reports on expenses, usage, and more for complete transparency.",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="bg-white p-6 rounded-lg border border-muted"
                >
                  <h3 className="font-serif text-xl font-medium mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-navy-900 text-white">
          <div className="container mx-auto px-4 text-center">
            <div className="max-w-3xl mx-auto space-y-8">
              <h2 className="font-serif text-3xl md:text-4xl font-bold">
                Ready to Transform Your Co-Ownership Experience?
              </h2>
              <p className="text-lg text-navy-100">
                Join thousands of property co-owners who have simplified their management and eliminated conflicts.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gold-500 hover:bg-gold-600 text-navy-900"
                >
                  Start Your Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy-950 text-white pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-serif text-lg font-bold mb-4">CoHaven</h3>
              <p className="text-navy-200 mb-4">
                Elegant property co-ownership management for modern owners.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-4">Product</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/features" className="text-navy-200 hover:text-white">
                    Features
                  </Link>
                </li>
                <li>
                  <Link to="/pricing" className="text-navy-200 hover:text-white">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link to="/roadmap" className="text-navy-200 hover:text-white">
                    Roadmap
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-4">Company</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/about" className="text-navy-200 hover:text-white">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="text-navy-200 hover:text-white">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/careers" className="text-navy-200 hover:text-white">
                    Careers
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-4">Legal</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/privacy" className="text-navy-200 hover:text-white">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-navy-200 hover:text-white">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-navy-800 pt-8 text-center text-sm text-navy-300">
            &copy; {new Date().getFullYear()} CoHaven. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
