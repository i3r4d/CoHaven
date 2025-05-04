
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HomeIcon } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-navy-50 to-white px-4 text-center">
      <h1 className="text-6xl font-serif font-bold text-navy-900 mb-4">404</h1>
      <p className="text-xl text-navy-700 mb-8">
        We couldn't find the page you're looking for.
      </p>
      <Link to="/dashboard">
        <Button className="bg-navy-900 hover:bg-navy-800">
          <HomeIcon className="mr-2 h-4 w-4" />
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFound;
