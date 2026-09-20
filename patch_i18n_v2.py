import re

with open('./apps/web/src/lib/i18n.ts', 'r') as f:
    content = f.read()

en_keys = """
    // Teacher Sidebar
    'nav.global_collab': 'Global Collaborations',
    'nav.inter_uni_research': 'Inter-Uni Research',
    'nav.ngo_mentorship': 'NGO Mentorship',
    'nav.volunteer_mentor': 'Volunteer & Mentor Portal',
    'nav.my_courses': 'My Courses',
    'nav.students': 'Students',
    'nav.timetable': 'Timetable',
    'nav.campus_services': 'Campus Services',
    'nav.messages': 'Messages',
    
    // Admin Sidebar
    'nav.overview': 'Overview',
    'nav.partner_institutions': 'Partner Institutions',
    'nav.sponsor_portal': 'Sponsor Portal',
    'nav.impact_analytics': 'Impact Analytics',
    'nav.management': 'Management',
    'nav.users': 'Users',
    'nav.administrative': 'Administrative',
    'nav.finances': 'Finances',
    'nav.campus_monitoring': 'Campus Monitoring',
    'nav.room_bookings': 'Room Bookings',
    'nav.timetable_management': 'Timetable Management',
    'nav.announcements': 'Announcements',

    // Teacher Dashboard
    'teacher.title': 'Teacher Dashboard',
    'teacher.new_course': 'New Course',
    'teacher.total_students': 'Total Students',
    'teacher.active_courses': 'Active Courses',
    'teacher.pending_grades': 'Pending Grades',
    'teacher.avg_class_score': 'Avg. Class Score',
    'teacher.grade_distribution': 'Grade Distribution',
    'teacher.performance_trend': 'Performance Trend',
    'teacher.add_course': 'Add Course',
    'teacher.recent_students': 'Recent Students',

    // Admin Dashboard
    'admin.title': 'Admin Overview',
    'admin.subtitle': 'System health and key metrics',
    'admin.send_announcement': 'Send Announcement',
    'admin.total_students': 'Total Students',
    'admin.active_courses': 'Active Courses',
    'admin.revenue': 'Revenue (Month)',
    'admin.uptime': 'System Uptime',
    'admin.departments': 'Departments',
    'admin.revenue_overview': 'Revenue Overview',
    'admin.recent_payments': 'Recent Payments',
    'admin.pending_approvals': 'Pending User Approvals',
    'admin.view_all_payments': 'View all payments',
    'admin.approve': 'Approve',
    'admin.reject': 'Reject',
"""

fr_keys = """
    // Teacher Sidebar
    'nav.global_collab': 'Collaborations mondiales',
    'nav.inter_uni_research': 'Recherche inter-universités',
    'nav.ngo_mentorship': 'Mentorat ONG',
    'nav.volunteer_mentor': 'Portail de bénévolat et de mentorat',
    'nav.my_courses': 'Mes cours',
    'nav.students': 'Étudiants',
    'nav.timetable': 'Emploi du temps',
    'nav.campus_services': 'Services du campus',
    'nav.messages': 'Messages',
    
    // Admin Sidebar
    'nav.overview': 'Aperçu',
    'nav.partner_institutions': 'Établissements partenaires',
    'nav.sponsor_portal': 'Portail des sponsors',
    'nav.impact_analytics': 'Analyses d\\'impact',
    'nav.management': 'Gestion',
    'nav.users': 'Utilisateurs',
    'nav.administrative': 'Administratif',
    'nav.finances': 'Finances',
    'nav.campus_monitoring': 'Surveillance du campus',
    'nav.room_bookings': 'Réservations de salles',
    'nav.timetable_management': 'Gestion des emplois du temps',
    'nav.announcements': 'Annonces',

    // Teacher Dashboard
    'teacher.title': 'Tableau de bord enseignant',
    'teacher.new_course': 'Nouveau cours',
    'teacher.total_students': 'Nombre total d\\'étudiants',
    'teacher.active_courses': 'Cours actifs',
    'teacher.pending_grades': 'Notes en attente',
    'teacher.avg_class_score': 'Note moyenne de la classe',
    'teacher.grade_distribution': 'Répartition des notes',
    'teacher.performance_trend': 'Tendance de performance',
    'teacher.add_course': 'Ajouter un cours',
    'teacher.recent_students': 'Étudiants récents',

    // Admin Dashboard
    'admin.title': 'Aperçu de l\\'administration',
    'admin.subtitle': 'État du système et indicateurs clés',
    'admin.send_announcement': 'Envoyer une annonce',
    'admin.total_students': 'Nombre total d\\'étudiants',
    'admin.active_courses': 'Cours actifs',
    'admin.revenue': 'Revenus (Mois)',
    'admin.uptime': 'Disponibilité du système',
    'admin.departments': 'Départements',
    'admin.revenue_overview': 'Aperçu des revenus',
    'admin.recent_payments': 'Paiements récents',
    'admin.pending_approvals': 'Approbations d\\'utilisateurs en attente',
    'admin.view_all_payments': 'Voir tous les paiements',
    'admin.approve': 'Approuver',
    'admin.reject': 'Rejeter',
"""

es_keys = """
    // Teacher Sidebar
    'nav.global_collab': 'Colaboraciones globales',
    'nav.inter_uni_research': 'Investigación interuniversitaria',
    'nav.ngo_mentorship': 'Mentoría de ONG',
    'nav.volunteer_mentor': 'Portal de voluntarios y mentores',
    'nav.my_courses': 'Mis cursos',
    'nav.students': 'Estudiantes',
    'nav.timetable': 'Horario',
    'nav.campus_services': 'Servicios del campus',
    'nav.messages': 'Mensajes',
    
    // Admin Sidebar
    'nav.overview': 'Visión general',
    'nav.partner_institutions': 'Instituciones asociadas',
    'nav.sponsor_portal': 'Portal de patrocinadores',
    'nav.impact_analytics': 'Análisis de impacto',
    'nav.management': 'Gestión',
    'nav.users': 'Usuarios',
    'nav.administrative': 'Administrativo',
    'nav.finances': 'Finanzas',
    'nav.campus_monitoring': 'Monitoreo del campus',
    'nav.room_bookings': 'Reserva de salas',
    'nav.timetable_management': 'Gestión de horarios',
    'nav.announcements': 'Anuncios',

    // Teacher Dashboard
    'teacher.title': 'Panel de profesores',
    'teacher.new_course': 'Nuevo curso',
    'teacher.total_students': 'Total de estudiantes',
    'teacher.active_courses': 'Cursos activos',
    'teacher.pending_grades': 'Calificaciones pendientes',
    'teacher.avg_class_score': 'Puntuación media de la clase',
    'teacher.grade_distribution': 'Distribución de calificaciones',
    'teacher.performance_trend': 'Tendencia de rendimiento',
    'teacher.add_course': 'Añadir curso',
    'teacher.recent_students': 'Estudiantes recientes',

    // Admin Dashboard
    'admin.title': 'Visión general del administrador',
    'admin.subtitle': 'Salud del sistema y métricas clave',
    'admin.send_announcement': 'Enviar anuncio',
    'admin.total_students': 'Total de estudiantes',
    'admin.active_courses': 'Cursos activos',
    'admin.revenue': 'Ingresos (Mes)',
    'admin.uptime': 'Tiempo de actividad del sistema',
    'admin.departments': 'Departamentos',
    'admin.revenue_overview': 'Visión general de ingresos',
    'admin.recent_payments': 'Pagos recientes',
    'admin.pending_approvals': 'Aprobaciones de usuarios pendientes',
    'admin.view_all_payments': 'Ver todos los pagos',
    'admin.approve': 'Aprobar',
    'admin.reject': 'Rechazar',
"""

hi_keys = """
    // Teacher Sidebar
    'nav.global_collab': 'वैश्विक सहयोग',
    'nav.inter_uni_research': 'अंतर-विश्वविद्यालय अनुसंधान',
    'nav.ngo_mentorship': 'एनजीओ मेंटरशिप',
    'nav.volunteer_mentor': 'स्वयंसेवक और मेंटर पोर्टल',
    'nav.my_courses': 'मेरे पाठ्यक्रम',
    'nav.students': 'छात्र',
    'nav.timetable': 'समय सारणी',
    'nav.campus_services': 'परिसर सेवाएं',
    'nav.messages': 'संदेश',
    
    // Admin Sidebar
    'nav.overview': 'अवलोकन',
    'nav.partner_institutions': 'साझेदार संस्थान',
    'nav.sponsor_portal': 'प्रायोजक पोर्टल',
    'nav.impact_analytics': 'प्रभाव विश्लेषण',
    'nav.management': 'प्रबंधन',
    'nav.users': 'उपयोगकर्ता',
    'nav.administrative': 'प्रशासनिक',
    'nav.finances': 'वित्त',
    'nav.campus_monitoring': 'परिसर निगरानी',
    'nav.room_bookings': 'कमरे की बुकिंग',
    'nav.timetable_management': 'समय सारणी प्रबंधन',
    'nav.announcements': 'घोषणाएं',

    // Teacher Dashboard
    'teacher.title': 'शिक्षक डैशबोर्ड',
    'teacher.new_course': 'नया पाठ्यक्रम',
    'teacher.total_students': 'कुल छात्र',
    'teacher.active_courses': 'सक्रिय पाठ्यक्रम',
    'teacher.pending_grades': 'लंबित ग्रेड',
    'teacher.avg_class_score': 'औसत कक्षा स्कोर',
    'teacher.grade_distribution': 'ग्रेड वितरण',
    'teacher.performance_trend': 'प्रदर्शन प्रवृत्ति',
    'teacher.add_course': 'पाठ्यक्रम जोड़ें',
    'teacher.recent_students': 'हाल के छात्र',

    // Admin Dashboard
    'admin.title': 'व्यवस्थापक अवलोकन',
    'admin.subtitle': 'सिस्टम स्वास्थ्य और प्रमुख मीट्रिक',
    'admin.send_announcement': 'घोषणा भेजें',
    'admin.total_students': 'कुल छात्र',
    'admin.active_courses': 'सक्रिय पाठ्यक्रम',
    'admin.revenue': 'राजस्व (माह)',
    'admin.uptime': 'सिस्टम अपटाइम',
    'admin.departments': 'विभाग',
    'admin.revenue_overview': 'राजस्व अवलोकन',
    'admin.recent_payments': 'हाल के भुगतान',
    'admin.pending_approvals': 'लंबित उपयोगकर्ता स्वीकृतियां',
    'admin.view_all_payments': 'सभी भुगतान देखें',
    'admin.approve': 'मंजूर',
    'admin.reject': 'अस्वीकार',
"""

content = re.sub(r"(\s+)'impact.join': 'Join Campaign',", r"\\1'impact.join': 'Join Campaign'," + en_keys, content)
content = re.sub(r"(\s+)'impact.join': 'Rejoindre la campagne',", r"\\1'impact.join': 'Rejoindre la campagne'," + fr_keys, content)
content = re.sub(r"(\s+)'impact.join': 'Unirse a la campaña',", r"\\1'impact.join': 'Unirse a la campaña'," + es_keys, content)
content = re.sub(r"(\s+)'impact.join': 'अभियान में शामिल हों',", r"\\1'impact.join': 'अभियान में शामिल हों'," + hi_keys, content)

with open('./apps/web/src/lib/i18n.ts', 'w') as f:
    f.write(content)
