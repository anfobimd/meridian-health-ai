import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Sparkles } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://oqjupcgtxsbyelaigrxn.supabase.co";
const SUPABASE_ANON =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";

interface MarketplaceProvider {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  credentials?: string;
  specialty?: string;
  bio?: string;
  avatar_url?: string;
  skills: { skill_name: string; modality: string; certification_level: string }[];
}

async function fetchProviders(): Promise<MarketplaceProvider[]> {
  const url = `${SUPABASE_URL}/functions/v1/marketplace-listings?path=providers`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  });
  if (!res.ok) throw new Error((await res.json())?.error || "Failed to load providers");
  const json = await res.json();
  return json.providers || [];
}

export default function PublicMarketplace() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-marketplace-providers"],
    queryFn: fetchProviders,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-10 space-y-2">
          <h1 className="text-3xl sm:text-4xl font-serif font-semibold">Find Your Provider</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose from our network of trusted aesthetic and wellness providers.
            Book directly — no account required.
          </p>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-sm text-destructive">
            Couldn't load providers. Please try again in a moment.
          </div>
        )}

        {data && data.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No providers are currently accepting bookings. Please check back soon.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                    <AvatarFallback>
                      {p.first_name[0]}{p.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {p.first_name} {p.last_name}
                      {p.credentials ? `, ${p.credentials}` : ""}
                    </p>
                    {p.specialty && (
                      <p className="text-sm text-muted-foreground truncate">{p.specialty}</p>
                    )}
                  </div>
                </div>
                {p.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{p.bio}</p>
                )}
                {p.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.skills.slice(0, 5).map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {s.skill_name}
                      </Badge>
                    ))}
                    {p.skills.length > 5 && (
                      <Badge variant="outline" className="text-xs">+{p.skills.length - 5}</Badge>
                    )}
                  </div>
                )}
                <Button asChild className="w-full" size="sm">
                  <Link to={`/book/${p.slug}`}>
                    <Sparkles className="h-3 w-3 mr-1" /> Book Now
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
