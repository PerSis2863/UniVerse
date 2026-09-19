'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Laptop, Wifi, Book, HelpCircle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function ServicesPage() {
  const services = [
    {
      title: 'IT Helpdesk',
      icon: Laptop,
      desc: 'Get help with your laptop, software installations, or account access.',
      action: 'Submit a ticket'
    },
    {
      title: 'Campus Wi-Fi',
      icon: Wifi,
      desc: 'Instructions for connecting your devices to eduroam and campus networks.',
      action: 'View guide'
    },
    {
      title: 'Library Services',
      icon: Book,
      desc: 'Access online databases, request interlibrary loans, or print documents.',
      action: 'Library portal'
    },
    {
      title: 'General Support',
      icon: HelpCircle,
      desc: 'Not sure where to go? Start here for general inquiries.',
      action: 'Contact support'
    }
  ];

  return (
    <>
      <Topbar title="Using My Services" subtitle="Guides and support for campus technology" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-8 mb-8 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Need immediate technical assistance?</h2>
            <p className="text-indigo-200/80 mb-6 max-w-lg mx-auto">
              Our IT support team is available 24/7 to help you resolve any issues with your university account or devices.
            </p>
            <div className="flex justify-center gap-4">
              <button onClick={() => toast.success('Calling IT Support...')} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                Call IT Support
              </button>
              <button onClick={() => window.open('/assets/dummy.pdf', '_blank')} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                Live Chat
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {services.map((service, i) => (
              <div key={i} onClick={() => toast.success(`${service.title} clicked`)} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 group cursor-pointer hover:border-zinc-600 transition-colors">
                <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4 text-zinc-400 group-hover:text-indigo-400 transition-colors">
                  <service.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-white mb-2">{service.title}</h3>
                <p className="text-sm text-zinc-400 mb-6">{service.desc}</p>
                <div className="flex items-center text-sm font-medium text-indigo-400 group-hover:text-indigo-300">
                  {service.action} <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
