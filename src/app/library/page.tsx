'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/layout/TopHeader';
import { MOCK_CATEGORIES } from '@/lib/data';

export default function EngineeringLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);

  const filteredCategories = MOCK_CATEGORIES.filter((cat) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        cat.name.toLowerCase().includes(q) ||
        cat.code.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const templatesList = [
    {
      id: 't-1',
      title: 'Command Center AV Matrix Topology Template',
      code: 'AV-TMPL-001',
      type: 'Draw.io / SVG',
      discipline: 'Audio Visual',
      size: '2.4 MB',
      updatedAt: '2026-07-15',
    },
    {
      id: 't-2',
      title: 'Structured Cabling Cat6A & OS2 Specifications',
      code: 'NET-SPEC-042',
      type: 'PDF Document',
      discipline: 'Networking',
      size: '1.8 MB',
      updatedAt: '2026-06-30',
    },
    {
      id: 't-3',
      title: 'Tier IV Data Center Electrical BOQ Calculator',
      code: 'DC-BOQ-099',
      type: 'Excel SheetJS',
      discipline: 'Cloud & Data Centers',
      size: '950 KB',
      updatedAt: '2026-07-20',
    },
    {
      id: 't-4',
      title: 'PlantUML Redundancy Architecture Baseline',
      code: 'PUML-NET-01',
      type: 'PlantUML Code',
      discipline: 'Networking',
      size: '18 KB',
      updatedAt: '2026-07-28',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader onSearch={setSearchQuery} />

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1440px] w-full mx-auto">
        {/* Banner */}
        <div className="flex justify-between items-end border-b border-[#c5c6ce] pb-4">
          <div>
            <span className="text-xs font-semibold text-[#005FB7] uppercase tracking-wider">
              Technical Repository
            </span>
            <h1 className="text-2xl font-bold text-[#05162e] mt-0.5">
              Engineering Library & Discipline Categories
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#75777e] font-mono">
              6 Core Disciplines • 89 Standard Templates
            </span>
          </div>
        </div>

        {/* Discipline Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              onClick={() =>
                setSelectedDiscipline(
                  selectedDiscipline === cat.name ? null : cat.name
                )
              }
              className={`border rounded p-4 bg-white transition-all cursor-pointer shadow-sm flex flex-col justify-between ${
                selectedDiscipline === cat.name
                  ? 'border-[#005FB7] ring-2 ring-[#005FB7]/20 bg-[#d4e3ff]/10'
                  : 'border-[#c5c6ce] hover:border-[#005FB7]'
              }`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div className="w-9 h-9 rounded bg-[#05162e] text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">
                      {cat.icon}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#00468a] bg-[#d6e3ff] px-2 py-0.5 rounded">
                    {cat.code}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#05162e]">{cat.name}</h3>
                  <p className="text-xs text-[#44474d] mt-1 leading-relaxed">
                    {cat.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#e6e8eb] flex justify-between items-center text-xs text-[#75777e]">
                <span>{cat.projectCount} Projects</span>
                <span className="font-semibold text-[#005FB7]">
                  {cat.templateCount} Templates →
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Standard Templates Table */}
        <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-sm flex flex-col mt-2">
          <div className="p-4 bg-[#f2f4f7] border-b border-[#c5c6ce] flex justify-between items-center">
            <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                description
              </span>
              Standardized Technical Templates & Specifications
            </h3>
            <span className="text-xs text-[#44474d] font-mono">
              Filtered: {selectedDiscipline || 'All Disciplines'}
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead className="bg-[#e6e8eb] text-[#191c1e] text-xs font-semibold border-b border-[#c5c6ce]">
              <tr>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Title</th>
                <th className="py-2.5 px-4">Discipline</th>
                <th className="py-2.5 px-4">Format</th>
                <th className="py-2.5 px-4">Size</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e8eb] text-xs text-[#191c1e]">
              {templatesList
                .filter(
                  (t) =>
                    !selectedDiscipline || t.discipline.includes(selectedDiscipline)
                )
                .map((tmpl) => (
                  <tr key={tmpl.id} className="hover:bg-[#f2f4f7] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#005FB7]">
                      {tmpl.code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#05162e]">
                      {tmpl.title}
                    </td>
                    <td className="py-3 px-4 text-[#44474d]">{tmpl.discipline}</td>
                    <td className="py-3 px-4 font-mono">{tmpl.type}</td>
                    <td className="py-3 px-4 text-[#75777e] font-mono">{tmpl.size}</td>
                    <td className="py-3 px-4 text-right">
                      <button className="px-3 py-1 bg-[#005FB7] text-white text-xs font-semibold rounded hover:bg-[#05162e] transition-colors inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          download
                        </span>
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
