
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import AuthLayout from "@/layouts/AuthLayout";

const ForgotPassword = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // This will be implemented with real authentication later
      // For now, we'll just simulate a successful password reset request
      setTimeout(() => {
        setIsSubmitted(true);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "There was a problem processing your request.",
        variant: "destructive",
      });
    }
  };

  if (isSubmitted) {
    return (
      <AuthLayout>
        <Card className="shadow-md animate-fade-in">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-serif">Check your email</CardTitle>
            <CardDescription>
              We've sent a password reset link to {email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you don't see the email in your inbox, please check your spam folder.
              The link will expire in 24 hours.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsSubmitted(false)}
            >
              Back to reset password
            </Button>
            <div className="text-center text-sm">
              <Link to="/signin" className="text-primary hover:underline flex items-center justify-center">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          </CardFooter>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="shadow-md animate-fade-in">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-serif">Reset password</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to reset your password
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="name@example.com"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full bg-navy-900 hover:bg-navy-800"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
            <div className="text-center text-sm">
              <Link to="/signin" className="text-primary hover:underline flex items-center justify-center">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  );
};

export default ForgotPassword;
