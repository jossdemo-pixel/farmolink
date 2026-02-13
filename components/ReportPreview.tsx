
import React, { useState } from 'react';
import { GeneratedReport, QuizData } from '../types';
import { Printer, FileText, ArrowLeft, Loader2, Image as ImageIcon } from 'lucide-react';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType, 
  PageBreak, 
  SectionType, 
  ImageRun,
  Footer,
  PageNumber
} from "docx";

interface ReportPreviewProps {
  report: GeneratedReport;
  data: QuizData;
  onBack: () => void;
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({ report, data, onBack }) => {
  const [isExportingWord, setIsExportingWord] = useState(false);

  const safeBase64ToUint8Array = (base64: string) => {
    try {
      if (!base64.includes(',')) return null;
      const base64String = base64.split(',')[1];
      const binaryString = window.atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (e) {
      return null;
    }
  };

  const handlePrint = () => {
    setTimeout(() => window.print(), 500);
  };

  const handleExportWord = async () => {
    setIsExportingWord(true);
    try {
      let logoImage = null;
      if (data.logoBase64) {
        const imageBytes = safeBase64ToUint8Array(data.logoBase64);
        if (imageBytes) {
          logoImage = new ImageRun({
            data: imageBytes,
            transformation: { width: 70, height: 70 },
          });
        }
      }

      const margins = { top: 1701, bottom: 1134, left: 1701, right: 1134 };

      const createPara = (children: any[], align = AlignmentType.JUSTIFIED, spacingBefore = 200, spacingAfter = 200) => 
        new Paragraph({ 
          children, 
          alignment: align, 
          spacing: { line: 360, before: spacingBefore, after: spacingAfter } 
        });

      const createTitle = (text: string, size = 28) => 
        new TextRun({ text, bold: true, size, font: "Times New Roman" });

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: "Times New Roman", size: "12pt" }
            }
          }
        },
        sections: [{
          properties: { 
            type: SectionType.NEXT_PAGE,
            page: { margin: margins }
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })]
              })]
            })
          },
          children: [
            // CAPA
            new Paragraph({ alignment: AlignmentType.CENTER, children: logoImage ? [logoImage] : [] }),
            createPara([createTitle(data.instituicao.toUpperCase())], AlignmentType.CENTER, 200),
            createPara([createTitle(data.departamento.toUpperCase(), 24)], AlignmentType.CENTER, 50),
            createPara([createTitle(`CURSO DE ${data.curso.toUpperCase()}`, 24)], AlignmentType.CENTER, 50),
            new Paragraph({ text: "", spacing: { before: 2000 } }),
            createPara([createTitle("RELATÓRIO DE ESTÁGIO FINAL REALIZADO NO", 28)], AlignmentType.CENTER),
            createPara([createTitle(`"${data.localEstagio.toUpperCase()}"`, 28)], AlignmentType.CENTER),
            new Paragraph({ text: "", spacing: { before: 2000 } }),
            createPara([createTitle(data.nomeCompleto.toUpperCase(), 26)], AlignmentType.CENTER),
            new Paragraph({ text: "", spacing: { before: 1500 } }),
            createPara([createTitle(`${data.provincia.toUpperCase()}/${data.anoLectivo}`, 24)], AlignmentType.CENTER),
            new Paragraph({ children: [new PageBreak()] }),

            // FOLHA DE ROSTO
            createPara([createTitle(data.instituicao.toUpperCase(), 26)], AlignmentType.CENTER, 0),
            createPara([createTitle(data.departamento.toUpperCase(), 22)], AlignmentType.CENTER, 50),
            createPara([createTitle(`CURSO DE ${data.curso.toUpperCase()}`, 22)], AlignmentType.CENTER, 50),
            new Paragraph({ text: "", spacing: { before: 1000 } }),
            createPara([createTitle(data.nomeCompleto.toUpperCase(), 26)], AlignmentType.CENTER),
            new Paragraph({ text: "", spacing: { before: 1500 } }),
            createPara([createTitle("RELATÓRIO DE ESTÁGIO FINAL", 28)], AlignmentType.CENTER),
            new Paragraph({ text: "", spacing: { before: 1000 } }),
            createPara([
              new TextRun({ 
                text: `Relatório de estágio apresentado ao ${data.instituicao}, como requisito parcial para obtenção do título de ${data.nivel}. Contém fundamentação teórica baseada na legislação angolana.`, 
                italic: true, 
                size: 22 
              })
            ], AlignmentType.RIGHT),
            new Paragraph({ text: "", spacing: { before: 800 } }),
            createPara([new TextRun({ text: `Supervisor(a): ${data.supervisor}`, bold: true, size: 24 })], AlignmentType.LEFT),
            new Paragraph({ text: "", spacing: { before: 2000 } }),
            createPara([createTitle(`${data.provincia}/${data.anoLectivo}`, 24)], AlignmentType.CENTER),
            new Paragraph({ children: [new PageBreak()] }),

            // SUMÁRIO CORRIGIDO
            createPara([createTitle("SUMÁRIO", 28)], AlignmentType.CENTER),
            ...[
              "1. INTRODUÇÃO ............................................................................................ 5",
              "2. OBJETIVOS GERAL E ESPECÍFICOS ..................................................... 6",
              "3. DESENVOLVIMENTO ............................................................................. 7",
              "   3.1 Identificação e Características do Campo ............................................. 7",
              "   3.2 Atividades Desenvolvidas e Fundamentação Teórica ......................... 10",
              "   3.3 Aprendizados e Competências Adquiridas ............................................. 14",
              "   3.4 Dificuldades e Facilidades (Análise Crítica) ........................................ 16",
              "4. CONCLUSÃO ............................................................................................. 18",
              "5. REFERÊNCIAS BIBLIOGRÁFICAS ..................................................... 19",
              "6. ANEXOS ...................................................................................................... 20"
            ].map(line => createPara([new TextRun({ text: line, bold: !line.startsWith(' '), size: 22 })], AlignmentType.LEFT, 100, 50)),
            new Paragraph({ children: [new PageBreak()] }),

            // CONTEÚDO
            createPara([createTitle("RESUMO", 28)], AlignmentType.CENTER),
            createPara([new TextRun(report.resumo)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("ABSTRACT", 28)], AlignmentType.CENTER),
            createPara([new TextRun({ text: report.abstract, italic: true })]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("1. INTRODUÇÃO", 28)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.introducao)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("2. OBJETIVOS GERAL E ESPECÍFICOS", 28)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.objetivos)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("3. DESENVOLVIMENTO", 28)], AlignmentType.LEFT, 400),
            createPara([createTitle("3.1 Identificação e Características do Campo de Estágio", 24)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.caracterizacao)]),
            new Paragraph({ children: [new PageBreak()] }),
            
            createPara([createTitle("3.2 Atividades Desenvolvidas e Fundamentação Teórica", 24)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.atividades)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("3.3 Aprendizados e Competências Adquiridas", 24)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.competencias)]),
            new Paragraph({ children: [new PageBreak()] }),
            
            createPara([createTitle("3.4 Dificuldades e Facilidades (Análise Crítica)", 24)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.dificuldades)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("4. CONCLUSÃO", 28)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.conclusao)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("5. REFERÊNCIAS BIBLIOGRÁFICAS", 28)], AlignmentType.LEFT, 400),
            createPara([new TextRun(report.referencias)]),
            new Paragraph({ children: [new PageBreak()] }),

            createPara([createTitle("6. ANEXOS", 28)], AlignmentType.CENTER, 400),
            ...(data.anexosBase64?.map(imgBase64 => {
              const bytes = safeBase64ToUint8Array(imgBase64);
              if (bytes) {
                return new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: bytes,
                      transformation: { width: 450, height: 350 },
                    }),
                    new TextRun({ text: "\nEvidência de Atividade de Campo", break: 1, italic: true })
                  ],
                  spacing: { before: 400, after: 400 }
                });
              }
              return null;
            }).filter(p => p !== null) || [])
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Relatorio_Academico_15Pag_${data.nomeCompleto.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error(error);
      alert("Erro ao exportar. Tente imprimir.");
    } finally {
      setIsExportingWord(false);
    }
  };

  const Page: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
    <div className={`bg-white shadow-2xl mx-auto p-[3cm_2cm_2cm_3cm] mb-8 min-h-[29.7cm] w-[21cm] academic-font text-[12pt] leading-[1.6] border border-slate-200 relative ${className} page-break`}>
      {children}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 preview-container">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 font-semibold transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar e Editar</span>
        </button>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExportWord} disabled={isExportingWord} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50">
            {isExportingWord ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            <span>Descarregar Word (15+ Pág)</span>
          </button>
          <button onClick={handlePrint} className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg">
            <Printer className="w-5 h-5" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-20">
        <Page className="flex flex-col items-center text-center font-bold uppercase">
          {data.logoBase64 && <img src={data.logoBase64} alt="Logo" className="max-h-24 mb-6" />}
          <h2 className="text-xl mb-1">{data.instituicao}</h2>
          <h3 className="text-lg mb-1">{data.departamento}</h3>
          <h3 className="text-lg">CURSO DE {data.curso}</h3>
          <div className="my-auto py-20"><h1 className="text-2xl leading-relaxed">RELATÓRIO DE ESTÁGIO FINAL REALIZADO NO<br/>"{data.localEstagio}"</h1></div>
          <div className="mt-auto"><p className="text-xl mb-4">{data.nomeCompleto}</p><p>{data.provincia}/{data.anoLectivo}</p></div>
        </Page>

        <Page className="flex flex-col text-center font-bold uppercase">
          <div className="mb-10 text-center">
            <h2 className="text-lg mb-1">{data.instituicao}</h2>
            <h3 className="text-base mb-1">{data.departamento}</h3>
            <h3 className="text-base">CURSO DE {data.curso}</h3>
          </div>
          <p className="text-xl mb-20">{data.nomeCompleto}</p>
          <h1 className="text-2xl mb-16">RELATÓRIO DE ESTÁGIO FINAL</h1>
          <div className="ml-auto w-2/3 text-right normal-case font-normal text-sm italic mb-10">
            Relatório de estágio apresentado ao {data.instituicao}, como requisito parcial para obtenção do título de {data.nivel}. Contém fundamentação teórica baseada na legislação angolana.
          </div>
          <div className="text-left normal-case font-bold mt-10"><p>Supervisor(a): {data.supervisor}</p></div>
          <div className="mt-auto"><p>{data.provincia}/{data.anoLectivo}</p></div>
        </Page>

        <Page>
          <h2 className="text-center font-bold mb-10 text-xl uppercase underline">SUMÁRIO</h2>
          <div className="space-y-4 font-bold text-sm">
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>1. INTRODUÇÃO</span><span>5</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>2. OBJETIVOS GERAL E ESPECÍFICOS</span><span>6</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>3. DESENVOLVIMENTO</span><span>7</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300 pl-6 font-normal"><span>3.1 Identificação e Características do Campo</span><span>7</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300 pl-6 font-normal"><span>3.2 Atividades e Fundamentação Teórica</span><span>10</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300 pl-6 font-normal"><span>3.3 Aprendizados e Competências</span><span>14</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300 pl-6 font-normal"><span>3.4 Dificuldades e Facilidades (Análise)</span><span>16</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>4. CONCLUSÃO</span><span>18</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>5. REFERÊNCIAS BIBLIOGRÁFICAS</span><span>19</span></div>
            <div className="flex justify-between border-b border-dotted border-slate-300"><span>6. ANEXOS</span><span>20</span></div>
          </div>
        </Page>

        <Page>
          <h2 className="text-center font-bold mb-8 uppercase">RESUMO</h2>
          <p className="text-justify mb-8">{report.resumo}</p>
          <p className="font-bold text-sm">Palavras-chave: Farmácia, Estágio, Angola, Assistência Farmacêutica, Fundamentação Teórica.</p>
        </Page>

        <Page>
          <h2 className="text-center font-bold mb-8 uppercase">ABSTRACT</h2>
          <p className="text-justify mb-8 italic">{report.abstract}</p>
          <p className="font-bold text-sm">Keywords: Pharmacy, Internship, Angola, Pharmaceutical Care, Health Policy.</p>
        </Page>

        <Page><h2 className="font-bold mb-6 uppercase">1. INTRODUÇÃO</h2><div className="text-justify whitespace-pre-wrap">{report.introducao}</div></Page>
        
        <Page><h2 className="font-bold mb-6 uppercase">2. OBJETIVOS GERAL E ESPECÍFICOS</h2><div className="text-justify whitespace-pre-wrap">{report.objetivos}</div></Page>

        <Page>
          <h2 className="font-bold mb-6 uppercase">3. DESENVOLVIMENTO</h2>
          <h3 className="font-bold mb-4">3.1 Identificação e Características do Campo de Estágio</h3>
          <div className="text-justify whitespace-pre-wrap">{report.caracterizacao}</div>
        </Page>
        <Page>
          <h3 className="font-bold mb-4">3.2 Atividades Desenvolvidas e Fundamentação Teórica</h3>
          <div className="text-justify whitespace-pre-wrap">{report.atividades}</div>
        </Page>
        <Page>
          <h3 className="font-bold mb-4">3.3 Aprendizados e Competências Adquiridas</h3>
          <div className="text-justify whitespace-pre-wrap mb-8">{report.competencias}</div>
          <h3 className="font-bold mb-4">3.4 Dificuldades e Facilidades (Análise Crítica)</h3>
          <div className="text-justify whitespace-pre-wrap">{report.dificuldades}</div>
        </Page>
        <Page><h2 className="font-bold mb-6 uppercase">4. CONCLUSÃO</h2><div className="text-justify whitespace-pre-wrap">{report.conclusao}</div></Page>
        <Page><h2 className="font-bold mb-6 uppercase">5. REFERÊNCIAS BIBLIOGRÁFICAS</h2><div className="text-justify whitespace-pre-wrap">{report.referencias}</div></Page>
        
        <Page>
          <h2 className="font-bold mb-10 uppercase text-center">6. ANEXOS</h2>
          <div className="grid grid-cols-1 gap-8 items-center">
            {data.anexosBase64 && data.anexosBase64.length > 0 ? (
              data.anexosBase64.map((img, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <img src={img} alt={`Anexo ${i}`} className="max-h-[15cm] object-contain border border-slate-200 shadow-sm" />
                  <p className="text-sm italic text-slate-500">Figura {i + 1}: Evidência de atividade prática em campo.</p>
                </div>
              ))
            ) : (
              <div className="text-center italic mt-20 p-10 border-2 border-dashed border-slate-300 rounded-xl">
                Nenhum anexo fotográfico foi carregado. <br/> Documentos físicos devem ser anexados manualmente.
              </div>
            )}
          </div>
        </Page>
      </div>
    </div>
  );
};
