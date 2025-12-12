'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Edit, Package, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Service {
  id: string;
  title: string;
  slug: string;
  priceInCents: number;
  category: string;
  chargesGst: boolean;
}

type ProviderServicesListProps = {
  services: Service[];
  isDeleting: string | null;
  onDelete: (id: string) => void;
};

export function ProviderServicesList({ services, isDeleting, onDelete }: ProviderServicesListProps) {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">My Services</h1>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/dashboard/services/new">
            <Plus className="mr-2 h-4 w-4" /> Create New
          </Link>
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-muted/10">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No services yet</h3>
          <p className="text-muted-foreground mb-4">Start earning by listing your first service.</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/services/new">Create Service</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader>
                <CardTitle className="truncate" title={service.title}>
                  {service.title}
                </CardTitle>
                <Badge variant="outline" className="w-fit capitalize">
                  {service.category}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="font-bold">
                  ${(service.priceInCents / 100).toFixed(2)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {service.chargesGst ? 'inc. GST' : 'exc. GST'}
                  </span>
                </p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/s/${service.slug}`} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/services/${service.id}/edit`}>
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Link>
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={!!isDeleting}>
                        {isDeleting === service.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this service listing.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(service.id)}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProviderServicesClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchServices = useCallback(() => {
    setIsLoading(true);
    fetch('/api/provider/services')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load services');
        return res.json();
      })
      .then((data: Service[]) => {
        setServices(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load services.' });
      });
  }, [toast]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleDelete = async (serviceId: string) => {
    setIsDeleting(serviceId);
    try {
      const res = await fetch(`/api/services/${serviceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete service');

      toast({ title: 'Service deleted' });
      fetchServices();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete service.' });
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex p-8 justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <ProviderServicesList services={services} isDeleting={isDeleting} onDelete={handleDelete} />;
}
