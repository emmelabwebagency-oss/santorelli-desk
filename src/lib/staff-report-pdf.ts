import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { reportDate, reportMetrics, reportNotes, StaffReport } from './staff-report';

export function downloadStaffReport(report: StaffReport) {
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const margin=15;
  const width=pdf.internal.pageSize.getWidth();
  pdf.setProperties({title:'Santorelli Desk - Report attività',author:'Santorelli Desk'});
  pdf.setFillColor(36,80,154);pdf.rect(0,0,width,31,'F');
  pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(20);
  pdf.text('Santorelli Desk',margin,13);
  pdf.setFont('helvetica','normal');pdf.setFontSize(11);
  pdf.text(report.scope==='studio'?'Report globale dello studio - suddivisione per operatore':'Report personale delle attività',margin,22);
  pdf.setTextColor(35,50,73);pdf.setFontSize(11);
  pdf.text(`Periodo: ${reportDate(report.from)} - ${reportDate(report.to)} (date incluse, Europe/Rome)`,margin,40);
  pdf.setFontSize(9);
  pdf.text(`Generato: ${new Date(report.generated_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'})}`,margin,46);
  let y=52;
  function table(head:string[],body:(string|number)[][]) {
    autoTable(pdf,{startY:y,head:[head],body,margin:{left:margin,right:margin,top:16,bottom:17},styles:{font:'helvetica',fontSize:9,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[36,80,154],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[241,245,252]},rowPageBreak:'avoid',didDrawPage:data=>{y=data.cursor?.y||y;}});
    y+=9;
  }
  function heading(text:string) {
    if(y>pdf.internal.pageSize.getHeight()-36){pdf.addPage();y=23;}
    pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.setTextColor(35,50,73);pdf.text(text,margin,y);y+=6;
  }
  heading(report.scope==='studio'?'Riepilogo globale':'Riepilogo personale');
  table(['Indicatore','Valore','Indicatore','Valore'],Array.from({length:5},(_,index)=>{
    const first=reportMetrics[index];const second=reportMetrics[index+5];
    return [first.label,report.totals[first.key],second.label,report.totals[second.key]];
  }));
  if(report.scope==='studio') {
    heading('Confronto per segretaria / operatore');
    table(['Operatore','Ruolo','Azioni','Richieste lavorate','Telefonate / tentativi','Richiami pianificati','Chiusure'],report.people.map(person=>[
      person.full_name,person.role==='segretaria'?'Segretaria':person.role==='admin'?'Admin Studio':person.role==='system'?'Sistema':person.role,
      person.actions,person.worked,person.calls,person.callbacks,person.completed,
    ]));
    table(['Operatore','Esiti email manuali','Esiti WhatsApp manuali','Appuntamenti manuali','Nuove richieste assegnate','Di queste aperte ora'],report.people.map(person=>[person.full_name,person.emails,person.whatsapp,person.appointments,person.received,person.open_now]));
  }
  for(const person of report.people) {
    heading(`${person.full_name}${person.active?'':' (accesso sospeso)'} - dettaglio giornaliero`);
    table(['Data','Azioni registrate','Richieste lavorate'],person.days.length?person.days.map(day=>[reportDate(day.day),day.actions,day.worked]):[['Nessuna attività registrata nel periodo',0,0]]);
  }
  heading('Criteri di lettura');
  for(const note of reportNotes) {
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    const lines=pdf.splitTextToSize(note,width-margin*2);
    const height=lines.length*4;
    if(y+height>pdf.internal.pageSize.getHeight()-18){pdf.addPage();y=23;}
    pdf.text(lines,margin,y);y+=height+4;
  }
  const pages=pdf.getNumberOfPages();
  for(let page=1;page<=pages;page++) {
    pdf.setPage(page);pdf.setTextColor(90,105,125);pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    pdf.text('Riservato - report amministrativo aggregato - nessun dato di contatto',margin,pdf.internal.pageSize.getHeight()-8);
    pdf.text(`${page} / ${pages}`,width-margin,pdf.internal.pageSize.getHeight()-8,{align:'right'});
  }
  pdf.save(`santorelli-report-${report.scope}-${report.from}-${report.to}.pdf`);
}
